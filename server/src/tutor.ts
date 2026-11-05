import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.ts";
import type { Lesson } from "./content.ts";
import type { BandId } from "./security.ts";

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TutorRequest {
  band: BandId;
  nickname: string;
  lesson: Lesson;
  questionIndex: number | null;
  /** Display order of the current question's options (order[shown] = original index). */
  optionOrder?: number[];
  /** true once the child has answered this question correctly — then explaining it fully is fine. */
  questionSolved: boolean;
  history: TutorTurn[];
  message: string;
}

export interface TutorResult {
  reply: string;
  /** Set when the reply was replaced or the message needs a parent's attention. */
  flag: null | "personal_info" | "wellbeing" | "unsafe_reply" | "answer_leak" | "refusal" | "error";
}

// ---------------------------------------------------------------------------
// Deterministic pre-checks (run before any model call)
//
// Messages that match never reach the AI: Hoot answers with fixed, reviewed wording and the
// message is flagged for the parent. The patterns aim to catch how children actually write
// ("kms", "unalive myself", "nobody would miss me", "he hits me") while leaving everyday talk
// alone ("I'm going to kill this level", "this homework is killing me", "what is 1234 + 5678").
// Tests: server/test/safety.test.ts. Red-team list: content/hoot-redteam.json.
// ---------------------------------------------------------------------------

export type WellbeingKind = "self_harm" | "abuse";
export type PersonalInfoKind = "email" | "phone" | "address" | "school" | "password" | "contact_handle" | "full_name";

/** Lower-case, straight apostrophes, no zero-width characters, single spaces. */
function normalise(message: string): string {
  return message
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Spellings children use to dodge filters: "dieeee", "killll", "k1ll mys3lf". */
function spellingVariants(t: string): string[] {
  const deleet = t.replace(/\S+/g, (w) => (/[a-z]/.test(w) && /[0-9@$]/.test(w) ? w.replace(/[0-9@$]/g, (c) => LEET[c] ?? c) : w));
  const out = new Set<string>();
  for (const v of [t, deleet]) {
    out.add(v);
    out.add(v.replace(/([a-z])\1{2,}/g, "$1")); // "dieeee" → "die"
    out.add(v.replace(/([a-z])\1{2,}/g, "$1$1")); // "killll" → "kill"
  }
  return [...out];
}

// --- self-harm and suicide --------------------------------------------------------------------
/** "kms" means "kill myself", unless it follows a number ("50 kms", "how many kms"). */
const NOT_AFTER_NUMBER = String.raw`(?<!\d\s?)(?<!\b(?:many|few|the|of|in|per|those|these|several|hundreds?|thousands?|millions?|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\s)`;
/** "I don't want to live" (end of thought) but not "I don't want to live in a city". */
const END_OF_THOUGHT = String.raw`(?=\s*(?:$|[^\p{L}\p{N}\s']|and\b|but\b|because\b|cause\b|cuz\b|so\b|anymore\b|any more\b|like this\b|now\b|tomorrow\b|ever again\b|again\b))`;

const SELF_HARM: RegExp[] = [
  /\b(?:kill|killing|hurt|hurting|harm|harming|cut|cutting|stab|stabbing|starve|starving|strangle|strangling|hang|hanging|drown|drowning|burn|burning|unalive|unaliving|shoot|shooting|poison|poisoning) (?:myself|my ?self)\b/,
  new RegExp(String.raw`${NOT_AFTER_NUMBER}\bkms\b`),
  /\b(?:told|tell|tells|telling|said|says|saying|keep saying|keeps saying) (?:me )?(?:to )?(?:go )?kys\b/,
  /\bunaliv(?:e|ing) (?:myself|my ?self|me)\b/,
  /\b(?:want|wanna|wanting|going|gonna|try|trying|tried|thinking about|think about|thought about|plan|planning|will|i'll|ima|i'ma|ready) (?:to )?unalive\b/,
  /\bsewer ?slide\b/,
  /\bsuicid(?:e|al)\b/,
  /\bself[- ]?harm(?:ing)?\b/,
  /\b(?:end|ending|take|taking) (?:my|my own) life\b/,
  /\bend it all\b/,
  /\b(?:want|wanna|wanting|wish|ready|planning|plan) (?:to )?(?:die|be dead|not (?:be alive|exist|wake up)|disappear forever)\b/,
  /\bwish (?:i|i'd) (?:was|were|could be|could just be) dead\b/,
  /\b(?:wish|if only) (?:i|i'd) (?:had )?(?:never been born|was never born|were never born|wasn't born|weren't born|was not born|didn't exist|did not exist|could disappear forever|could just disappear)\b/,
  new RegExp(String.raw`\b(?:don't|dont|do not|no longer) (?:want|wanna) (?:to )?(?:live|be alive|exist|wake up|be here)${END_OF_THOUGHT}`, "u"),
  /\bbetter off (?:dead|without me)\b/,
  /\b(?:nobody|no one|no-one|noone|nobody else) (?:would|will|'d|is going to|is gonna|gonna) (?:even )?(?:miss|notice|care) (?:me|if i|about me|that i)/,
  /\b(?:nobody|no one|noone) would care if i (?:died|was gone|wasn't here|disappeared)\b/,
  /\b(?:no reason|nothing) (?:left )?to live for\b/,
  /\blife (?:is not|isn't|isnt|ain't|aint|is no longer) worth (?:living|it)\b/,
  /\bcan't go on (?:anymore|any more|like this)\b/,
  /\b(?:i|i'll|i'm|im|i am|i will|i want to|i wanna|gonna|going to)\b(?: \w+){0,3} (?:overdose|take (?:all|a lot of|loads of|lots of) (?:the |my |of )?(?:pills|tablets))\b/,
  /\b(?:i|i'll|i'm going to|i'm gonna|im gonna|i want to|i wanna) jump (?:off|in front of) (?:a |the |my )?(?:bridge|building|roof|cliff|train|car|balcony)\b/,
  /\b(?:been|started|start|keep|keeps|kept|stop|stopped|i|i'm|im) cutting (?:again|my (?:arms?|wrists?|legs?|skin|thighs?))\b/,
  /\bcut (?:my|both) (?:wrists?|arms?|thighs?)\b/,
  /\bhow (?:many|much) (?:\S+ ){0,5}(?:to|would|until|before|will) (?:i |you |a person |someone |it )?(?:die|kill (?:me|myself|you|a person|someone)|be fatal|overdose)\b/,
  /\b(?:lethal|fatal|deadly) dose\b/,
  /(?:💀|☠|🔪|🪦|⚰)️? ?(?:myself|my ?self)\b/u,
  // Spanish, French, German, Hindi (romanised and Devanagari), Filipino
  /\b(?:quiero|me quiero|quisiera|voy a) (?:morir(?:me)?|matarme|suicidarme|desaparecer|hacerme daño|cortarme)/,
  /\b(?:suicidarme|matarme)\b/,
  /\b(?:je veux|j'ai envie de|je vais) (?:mourir|me tuer|me suicider|disparaître|me faire du mal)/,
  /\bme suicider\b/,
  /\bich (?:will|möchte|moechte|wünschte|wuensche) (?:nicht mehr leben|sterben|tot sein|mich umbringen)/,
  /\b(?:mich umbringen|selbstmord|suizid|mich ritzen)/,
  /\b(?:marna|mar jaana|mar jana|marne) (?:chahta|chahti|chahte)\b/,
  /\b(?:khudkushi|aatmahatya|atmahatya)\b/,
  /(?:मरना चाहत|मर जाना चाहत|आत्महत्या|खुदकुशी|ख़ुदकुशी)/,
  /\b(?:gusto ko(?: nang)? mamatay|magpakamatay)\b/,
];

// --- abuse, grooming and not feeling safe -----------------------------------------------------
const PERSON = String.raw`(?:he|she|they|someone|somebody|a (?:man|woman|boy|girl|guy|lady|grown-?up|adult|stranger|teacher|coach)|an (?:adult|older (?:boy|girl|kid|man|woman))|(?:my|our) (?:[a-z]+'s )?(?:mum|mom|mommy|mummy|mother|dad|daddy|father|step-? ?(?:dad|mum|mom|father|mother|brother|sister)|parents?|uncle|aunt|aunty|auntie|grandpa|grandma|granddad|grandad|grandfather|grandmother|nan|nana|cousin|brother|sister|teacher|coach|tutor|babysitter|nanny|neighbou?r|boyfriend|girlfriend|carer|guardian|family)|(?:his|her|their) (?:friend|boyfriend|girlfriend|brother|dad))`;
const HELPER_WORDS = String.raw`(?: (?:always|keeps|kept|sometimes|often|still|really|just|has|had|used to|tried to|tries to|will|would|did|does|started|starts|then|also))*`;
const ABUSE_VERB = String.raw`(?:hits?|hitting|slaps?|slapped|slapping|punch(?:es|ed|ing)?|kicks?|kicked|kicking|beats?|beating|chokes?|choked|choking|strangles?|strangled|burns?|burned|burnt|whips?|whipped|whipping|hurts?|hurting|touch(?:es|ed|ing)?|grabs?|grabbed|abuses?|abused|abusing|rapes?|raped|molests?|molested|shakes?|shook|starves?|starved)`;
/** "she beat me at chess" and "he beat me 3-0" are games, not abuse. */
const NOT_A_GAME = String.raw`(?!\s+(?:at|in (?:a |the )?(?:race|game|match|chess|football|soccer|cards|tennis|quiz|test)|on (?:the )?(?:leaderboard|test|quiz)|out\b|\d))`;

const ABUSE: RegExp[] = [
  new RegExp(String.raw`\b${PERSON}${HELPER_WORDS} ${ABUSE_VERB} me\b${NOT_A_GAME}`),
  new RegExp(String.raw`\b${PERSON}${HELPER_WORDS} (?:threatens?|threatened|says? (?:they|he|she)(?:'ll| will)) (?:to )?(?:kill|hurt|beat|hit) me\b`),
  /\btouch(?:es|ed|ing)? (?:me )?(?:on |in )?(?:my |me )?(?:private(?:s| parts?| areas?)?|down there|genitals?|vagina|penis|willy|boobs|breasts?)\b/,
  /\btouch(?:es|ed|ing)? me (?:down there|there|in (?:my |a )?(?:private|bad|wrong|weird|funny)|where|inappropriately|when no one|at night|and i didn't like)/,
  /\b(?:showed|shows|show|sent|sends|send) me (?:his|her|their|a|some)? ?(?:private(?:s| parts)?|naked|nude|dick|penis|willy|genitals)\b/,
  /\b(?:asked|asks|asking|wants|wanted|told|tells|made|makes|forced|forces|pressur\w*|dared|keeps asking|kept asking) me (?:to )?(?:send|take|show|share|film|make)\b[^.?!]{0,40}?\b(?:nudes?|naked|without (?:my |any )?clothes|in (?:my )?underwear|my (?:body|privates?|private parts|chest|boobs|bum))\b/,
  /\bsend (?:me |him |her |them )?nudes\b/,
  /\b(?:told|tells|made|makes|ask|asked|asks|asking|said) (?:me )?(?:not to tell|to keep (?:it|this|a|our|the)? ?secrets?|never to tell|i can't tell|i cannot tell)\b/,
  /\b(?:our|a) (?:little |special |big )?secret (?:from|and not tell) (?:my |our )?(?:mum|mom|dad|parents|family|teacher|anyone)/,
  /\b(?:someone|somebody|a (?:man|woman|guy|girl|boy|stranger|person|grown-?up|adult)|an adult|my (?:online|internet|new) friend|a friend (?:i met |from )?online|a (?:guy|man|girl|person) (?:i met )?online)\b[^.?!]{0,60}\b(?:wants?|wanted|asked|asks|asking|invited|keeps asking) (?:me )?to (?:meet|come (?:over|to)|visit|get in (?:his|her|their) car)/,
  /\b(?:says?|said|told me|keeps saying) (?:he|she|they)(?:'ll| will| would|'d) (?:hurt|beat|hit|kill) me\b/,
  /\b(?:he|she|they)(?:'ll| will) (?:hurt|beat|hit) me\b/,
  /\b(?:bring|bringing|brought|has|have|got|carry|carries|carrying) (?:a |his |her |their )?(?:knife|gun|weapon|blade)\b[^.?!]{0,30}\b(?:school|class)\b/,
  /\b(?:going to|gonna|will|wants to) (?:shoot|stab|bomb|attack) (?:up )?(?:the |my |our )?(?:school|class)\b/,
  /\b(?:being|been|was|were|got|get|getting|am|i'm|im) (?:sexually |physically )?(?:abused|molested|raped|assaulted|groomed|beaten up|trafficked)\b/,
  /\b(?:abuses|abusing|abused|rapes|raped|molests|molested|grooming|assaulted) me\b/,
  /\bsomeone (?:is )?(?:hurting|touching) me\b/,
  /\b(?:i'm|i am|im|i feel|i don't feel|i dont feel|i do not feel) (?:not |so )?(?:safe|unsafe|scared|afraid|terrified) (?:at home|to go home|of going home|in my (?:house|home)|around my|of my (?:mum|mom|dad|father|mother|step\w*|uncle|parents?|brother|family))/,
  /\b(?:won't|wont|doesn't|doesnt|don't|dont|never) (?:let me eat|give me (?:food|anything to eat)|feed me)\b/,
  /\b(?:locks?|locked|keeps?|kept) me (?:in|inside) (?:my room|a room|the (?:cupboard|closet|basement|shed|cellar))/,
  // Spanish, French, German, Hindi (romanised), Filipino
  /\bme (?:pega|pegan|golpea|golpean|maltrata|maltratan|viola|violan)\b/,
  /\b(?:abusa|abusan|abusó) de mí/,
  /\bme toca(?:n)? (?:mis partes|ahí|donde no)/,
  /\b(?:il|elle|ils|elles|on|mon \S+|ma \S+) me (?:frappe|frappent|bat|battent|viole|violent|touche les parties)\b/,
  /\b(?:er|sie|mein \S+|meine \S+) (?:schlägt|schlaegt|missbraucht|vergewaltigt) mich\b/,
  /\bmujhe (?:maar|maarta|maarti|maarte|peet|peet ta|peet ti)(?:ta|ti|te)?\b/,
  /\b(?:sinasaktan|binubugbog|ginagahasa) (?:ako|niya ako)\b/,
];

/** Which kind of wellbeing concern a message raises, if any. Self-harm wins when both apply. */
export function detectWellbeing(message: string): WellbeingKind | null {
  const vs = spellingVariants(normalise(message));
  if (vs.some((v) => SELF_HARM.some((r) => r.test(v)))) return "self_harm";
  if (vs.some((v) => ABUSE.some((r) => r.test(v)))) return "abuse";
  return null;
}

// --- personal information ---------------------------------------------------------------------
/** Words that can't be part of a school's name ("I go to bed after school" is not a school name). */
const NAME_STOP = String.raw`(?:a|an|the|my|our|this|that|school|primary|secondary|high|middle|elementary|junior|senior|year|grade|class|form|standard|after|before|by|for|from|and|then|when|with|bed|sleep|on|in|at|every|to|go|swimming|summer|sunday|night|dance|music|art|driving|boarding|home)`;
/** Words that can't be part of a street name ("a car drives 60 km down the road" is not an address). */
const STREET_STOP = String.raw`(?:the|a|an|of|on|in|to|at|down|up|along|across|over|and|or|km|kms|miles?|metres?|meters?|m|cm|cars?|buses|trucks|people|houses|minutes?|mins?|hours?|times?|blocks?|steps?|more|less|big|small|long|new|old|other|different|is|are|was|were)`;

const PERSONAL_INFO: [PersonalInfoKind, RegExp][] = [
  ["email", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/],
  ["email", /\b[\w.+-]+ ?(?:\(at\)|\[at\]| at ) ?(?:gmail|googlemail|yahoo|hotmail|outlook|icloud|live|msn|aol|proton(?:mail)?|ymail|rediffmail|gmx) ?(?:\.|dot|\(dot\)|\[dot\])/],
  ["phone", /\b(?:my|mum's|mom's|dad's|our|home|house|parents'?|mobile|cell|phone|whatsapp)\b[^.?!]{0,25}\b(?:number|no\.?|num|digits|phone|mobile|cell)\b[^.?!\d]{0,12}\+?\d[\d\s().-]{5,}\d/],
  ["phone", /\b(?:call|text|ring|phone|whatsapp|message|sms) (?:me|us|my (?:mum|mom|dad)) (?:on|at)\b[^.?!\d]{0,6}\+?\d[\d\s().-]{5,}\d/],
  ["address", /\b(?:my|our) (?:home |house |full |street |postal )?address(?:'s| is|:| =)/],
  ["address", /\bi live at \S/],
  ["address", /\b(?:my|our) (?:house|home|flat|apartment) (?:is )?(?:at|number is|no\.? is|is number)\b/],
  ["address", /\b(?:my|our) (?:post ?code|postal code|zip(?: ?code)?|pin ?code|eircode) (?:is|:)/],
  [
    "address",
    new RegExp(String.raw`\b\d{1,5}[a-z]?,? (?:(?!${STREET_STOP}\b)[a-z][a-z'.-]*,? ){1,3}(?:street|st|road|rd|avenue|ave|lane|ln|drive|close|crescent|boulevard|blvd|terrace|place|court|gardens|grove|marg|nagar|colony|layout)\b`),
  ],
  ["address", /\bi live on (?:\w+ ){0,3}(?:street|road|avenue|lane|drive|close|crescent|boulevard|terrace|court)\b/],
  [
    "school",
    /\b(?:my|our) school(?:'s)? (?:name )?(?:is|=|:|called)\b(?!\s+(?:closed|open|big|small|fun|boring|hard|easy|great|good|bad|nice|cool|strict|far|near|close|nearby|really|so|too|very|not|having|doing|starting|going|on|off|out|over|finished|cancelled|canceled|a|an|teaching|making|giving|letting|about|like|ok|okay|fine|amazing|awesome|annoying|huge|tiny|new|old|online|shut|ending|back|the (?:best|worst)|in (?:a|the)\b))/,
  ],
  ["school", /\b(?:name of my school|my school'?s name|school name) (?:is|:)/],
  [
    "school",
    new RegExp(
      String.raw`\b(?:i go to|i attend|i'm at|i am at|im at|i study at|i'm a (?:student|pupil) at)\s+(?:(?!${NAME_STOP}\b)[a-z0-9'.&-]+\s+){1,4}(?:school|academy|college|primary|high|secondary|elementary|vidyalaya|convent|grammar|institute)\b`,
    ),
  ],
  [
    "password",
    /\b(?:my|our|mum's|mom's|dad's|parents'?|the wifi|wifi|wi-fi|ipad|phone|laptop|computer|account|roblox|minecraft|fortnite|google|gmail|email|apple id|school login)\s?(?:password|passcode|pass code|pin|pin code|pw|passwd|login)(?:'s| is|:| =|=)\s*(?!(?:strong|weak|long|short|safe|secure|good|bad|easy|hard|too|very|really|not|the same|secret|private|hidden|a secret|changed|reset|wrong|forgotten|lost|expired|locked)\b)\S/,
  ],
  ["password", /\bpassword\s*[:=]\s*\S/],
  ["password", /\bhere(?:'s| is) (?:my|the) (?:password|passcode|pin)\b/],
  ["password", /\b(?:mi|la) contraseña (?:es|:)|\bmon mot de passe (?:est|:)|\bmein passwort (?:ist|:)|\bmera password\b/],
  ["contact_handle", /(?:^|\s)@[a-z_][a-z0-9_.]{2,}/],
  ["contact_handle", /\b(?:add|follow|message|dm|text|find|friend) me on (?:insta(?:gram)?|snap(?:chat)?|tiktok|discord|whatsapp|telegram|kik|facebook|fb|roblox|fortnite|minecraft|xbox|psn|playstation|steam|twitter|threads|youtube|wechat|signal)\b/],
  ["contact_handle", /\bmy (?:(?:insta(?:gram)?|snap(?:chat)?|tiktok|discord|whatsapp|telegram|kik|roblox|fortnite|minecraft|xbox|psn|steam) (?:name|username|user name|handle|id|tag|account|code)|username|user name|user id|gamer ?tag|handle) (?:is|:|=)\s*@?[a-z0-9_.]{3,}/],
  ["full_name", /\bmy (?:full|real|whole|last|sur|family) ?name(?: is|'s|:)/],
  ["full_name", /\bmy surname(?: is|'s|:)/],
];

const MATH_CONTEXT = /[=×÷*/^+]|\b(?:plus|minus|times|divided|multiply|multiplied|subtract|add|sum|product|difference|quotient|calculate|solve|equals|how much|how many|round|digits?)\b/;

/**
 * Phone-number heuristic that leaves maths alone. A run of digits (with spaces, dashes or brackets)
 * counts as a phone number when it starts with "+", or has 10–15 digits outside a sum, or is a
 * grouped 7–9 digit number outside a sum. Number sequences ("10 20 30 40") and year ranges
 * ("1939-1945") are not phone numbers.
 */
function looksLikePhone(t: string): boolean {
  const maths = MATH_CONTEXT.test(t.replace(/(?:^|\s)\+\d/g, " "));
  for (const m of t.matchAll(/\+?\(?\d[\d\s()-]{5,}\d\)?/g)) {
    const raw = m[0].trim();
    const groups = raw.split(/[\s()-]+/).filter(Boolean);
    const digits = groups.join("").length;
    if (digits < 7 || digits > 15) continue;
    if (raw.startsWith("+") && digits >= 8) return true;
    const nums = groups.map(Number);
    if (groups.length >= 3 && nums.every((n, i) => i === 0 || n > nums[i - 1]!)) continue; // 10 20 30 40
    if (groups.length >= 3 && nums.every((n, i) => i === 0 || n < nums[i - 1]!)) continue; // 40 30 20 10
    if (groups.length > 2 && groups.slice(1).some((g) => g.length === 1)) continue; // lists of small numbers
    if (groups.length >= 2 && groups.every((g) => g.length === 4 && +g >= 1000 && +g <= 2099)) continue; // years
    if (digits >= 10) {
      if (maths && groups.length === 1 && !raw.startsWith("0")) continue;
      return true;
    }
    if (!maths && groups.length >= 2 && groups.length <= 3 && groups.every((g) => g.length >= 2)) return true;
  }
  return false;
}

/** Which kind of personal information a message contains, if any. */
export function detectPersonalInfo(message: string): PersonalInfoKind | null {
  const t = normalise(message);
  for (const [kind, r] of PERSONAL_INFO) if (r.test(t)) return kind;
  if (looksLikePhone(t)) return "phone";
  return null;
}

// --- helplines --------------------------------------------------------------------------------
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HelplineSchema = z.object({
  name: z.string().min(1),
  organisation: z.string().min(1),
  phone: z.string().min(1).optional(),
  altPhone: z.string().optional(),
  text: z.string().optional(),
  chat: z.string().optional(),
  free: z.boolean().nullable(),
  hours: z.string().min(1),
  hoursShort: z.string().optional(),
  ages: z.string().optional(),
  topics: z.array(z.enum(["self_harm", "abuse", "any"])).min(1),
  source: z.url(),
  crossCheck: z.url().optional(),
  note: z.string().optional(),
  checkedOn: Day,
});
const CountrySchema = z.object({
  name: z.string().min(1),
  emergency: z.object({ dial: z.string().min(1), notes: z.string().optional(), source: z.url(), checkedOn: Day }),
  helplines: z.array(HelplineSchema).min(1),
});
const HelplinesFile = z.object({
  status: z.string(),
  checkedOn: Day,
  countries: z.record(z.string().regex(/^[A-Z]{2}$/, "country keys must be ISO 3166-1 alpha-2 codes"), CountrySchema),
  fallback: CountrySchema,
});
export type Helpline = z.infer<typeof HelplineSchema>;
export type CountryHelplines = z.infer<typeof CountrySchema> & { country: string };
export type HelplinesData = z.infer<typeof HelplinesFile>;

/** Reads and validates content/helplines.json. Throws if the file is malformed (`npm run validate` uses this). */
export function loadHelplines(contentDir = config.contentDir): HelplinesData {
  return HelplinesFile.parse(JSON.parse(readFileSync(join(contentDir, "helplines.json"), "utf8")));
}

let helplineCache: HelplinesData | null | undefined;
const COUNTRY_ALIASES: Record<string, string> = { UK: "GB" };

/**
 * The emergency number and free child/youth helplines for a country, from content/helplines.json.
 *
 * `country` is an ISO 3166-1 alpha-2 code ("IN", "US", "GB"…; "UK" is accepted for GB), any case.
 * Returns null when the country is missing or not listed, or the file can't be read. Hoot then
 * keeps its generic wording ("call your local emergency number…").
 *
 * Wiring (server/src/app.ts, for the lead): once the family's country is stored, pass it as the
 * third argument: `precheck(body.message, pub.band, family.country)`. Nothing else is needed.
 * The data is a draft until a safeguarding reviewer re-checks it (see `status` in the JSON file).
 */
export function helplineFor(country?: string): CountryHelplines | null {
  if (!country) return null;
  if (helplineCache === undefined) {
    try {
      helplineCache = loadHelplines();
    } catch (err) {
      console.error("helplines.json could not be loaded; Hoot uses generic wording.", err instanceof Error ? err.message : err);
      helplineCache = null;
    }
  }
  const code = country.trim().toUpperCase();
  const key = COUNTRY_ALIASES[code] ?? code;
  const entry = helplineCache?.countries[key];
  return entry ? { ...entry, country: key } : null;
}

/** The helpline Hoot names for this concern: the first that lists the topic, else the first one. */
function pickHelpline(entry: CountryHelplines, kind: WellbeingKind): Helpline {
  return entry.helplines.find((h) => h.topics.includes(kind)) ?? entry.helplines[0]!;
}

const shortName = (h: Helpline) => h.name.replace(/\s*\([^)]*\)\s*$/, "");

function contactWays(h: Helpline): string {
  const ways: string[] = [];
  if (h.phone && h.text === h.phone) ways.push(`call or text ${h.phone}`);
  else {
    if (h.phone) ways.push(`call ${h.phone}`);
    if (h.text) ways.push(h.text.startsWith("WhatsApp") ? `message them on ${h.text}` : `text ${h.text}`);
  }
  if (h.chat) ways.push(`chat online at ${h.chat}`);
  return ways.length > 1 ? `${ways.slice(0, -1).join(", ")} or ${ways.at(-1)}` : (ways[0] ?? "");
}

function openWhen(h: Helpline): string {
  const parts = [h.free ? "free" : null, h.hours === "24/7" ? "day or night" : h.hoursShort ? `open ${h.hoursShort}` : null].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

const YOUNG_GENERIC =
  "Thank you for telling me. This is really important. Please tell a grown-up you trust right now, like a parent or teacher. You are not alone. 💛";
const OLDER_GENERIC =
  "Thank you for telling me — that took courage. I'm a learning helper, so I can't help with this the way a person can. Please talk to a trusted adult right now (a parent, teacher or school counsellor). If you are in danger, call your local emergency number. Many countries also have a free children's helpline — a trusted adult can help you find yours. You matter. 💛";

/** Hoot's fixed reply to a self-harm or abuse message. The wording needs a safeguarding professional's approval. */
export function wellbeingReply(band: BandId, kind: WellbeingKind, country?: string): string {
  const entry = helplineFor(country);
  const young = band === "b1" || band === "b2";
  if (!entry) return young ? YOUNG_GENERIC : OLDER_GENERIC;
  const h = pickHelpline(entry, kind);
  if (young) {
    const call = h.phone ? ` You can also call ${shortName(h)} on ${h.phone}.${h.free ? " It's free." : ""}` : "";
    return `Thank you for telling me. This is really important. Please tell a grown-up you trust right now, like a parent or teacher.${call} If you are in danger, call ${entry.emergency.dial}. You are not alone. 💛`;
  }
  return (
    "Thank you for telling me — that took courage. I'm a learning helper, so I can't help with this the way a person can. " +
    "Please talk to a trusted adult right now (a parent, teacher or school counsellor). " +
    `You can also contact ${shortName(h)}: ${contactWays(h)}${openWhen(h)}. ` +
    `If you are in danger right now, call ${entry.emergency.dial}. You matter. 💛`
  );
}

export const PERSONAL_INFO_REPLY =
  "Let's keep that private! 🔒 Never share things like your address, phone number, email, school or passwords online — not even with me. Can you ask your question again without it?";

/**
 * Deterministic safety check, run before any AI call. Returns Hoot's fixed reply and a flag, or null
 * if the message can go to the tutor. Wellbeing is checked before personal information.
 *
 * @param country optional ISO 3166-1 alpha-2 code of the family's country. When known, the wellbeing
 *   reply names that country's helpline and emergency number (see `helplineFor`); otherwise the
 *   generic wording is used. Existing two-argument callers are unaffected.
 */
export function precheck(message: string, band: BandId, country?: string): TutorResult | null {
  const concern = detectWellbeing(message);
  if (concern) return { reply: wellbeingReply(band, concern, country), flag: "wellbeing" };
  if (detectPersonalInfo(message)) return { reply: PERSONAL_INFO_REPLY, flag: "personal_info" };
  return null;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const BAND_STYLE: Record<BandId, string> = {
  b1: "The learner is 3–5 years old. (Chat is disabled for this age; this prompt should not be used.)",
  b2: "The learner is 6–8 years old and is just learning to read. Use very short sentences (under 10 words each), simple words, at most 3 sentences per reply, and a friendly emoji now and then. Praise effort ('Great thinking!'), never intelligence.",
  b3: "The learner is 9–11 years old. Use short, clear sentences (under 15 words), at most 4 sentences per reply. Encourage them to explain their thinking. Praise effort and strategy.",
  b4: "The learner is 12–14 years old. Be respectful and never babyish. Keep replies under 80 words. Use Socratic questions that make them reason it out.",
  b5: "The learner is 15–18 years old. Talk to them like a capable young adult. Keep replies under 120 words. Use Socratic questioning, point out strategies, and help them plan their study.",
};

/** Stable per-band instructions. Kept byte-identical across requests so it can be cached. */
export function tutorSystemPrompt(band: BandId): string {
  return `You are "Hoot", the learning helper inside Honest Learn, an education app for children and teenagers.

${BAND_STYLE[band]}

How you help:
- You NEVER give the final answer to a quiz question, homework or assignment, and you never write essays or solve problems for the learner. You help them get there themselves.
- Use the hint ladder. First a small nudge that points to what to think about. If they are still stuck, a bigger hint or a strategy. If they are still stuck after that, walk through a DIFFERENT but similar example step by step, then ask them to try the original again.
- Ask one question at a time and wait for their thinking. If they get something wrong, say what was good about their attempt, then guide them.
- Once a question is marked as solved, you may explain the full reasoning to deepen understanding.
- If they ask about general ideas in the lesson (not the answer to a question), explain clearly and simply, then check understanding with a quick question.

Honesty:
- Be accurate. If you are not sure, say so and suggest checking a trusted source with a grown-up. Never make up facts.
- You are a computer program, not a person. Say so if asked. Never pretend to have a body, family or feelings.

Safety (most important):
- Stay on learning topics suitable for the learner's age. Politely steer off-topic or inappropriate requests back to learning.
- Never ask for or repeat personal information (name of school, address, phone, email, photos, passwords). If they share it, remind them to keep it private.
- If the learner seems upset, unsafe, or mentions being hurt, respond kindly, tell them to talk to a trusted adult right away, and do not continue the lesson.
- Never discuss violent, sexual, frightening or adult content. Never give medical, legal or dangerous instructions; refer them to a trusted adult.
- Do not include links.

Reply in plain text only (no markdown headings or tables).`;
}

/** Per-lesson context, appended after the stable band prompt. Contains the secret answer. */
export function lessonContext(req: TutorRequest): string {
  const l = req.lesson;
  const sections = l.sections
    .filter((s) => s.type !== "parent")
    .map((s) => `- ${s.body}`)
    .join("\n");
  let ctx = `Current lesson: "${l.title}"\nLesson content:\n${sections}\n`;
  if (req.questionIndex !== null) {
    const q = l.quiz[req.questionIndex]!;
    // Number the options the way the learner sees them on screen.
    const order = req.optionOrder ?? [...q.options.keys()];
    ctx += `\nThe learner is working on this quiz question: "${q.q}"\nOptions as shown to the learner: ${order.map((o, i) => `(${i + 1}) ${q.options[o]}`).join("  ")}\n`;
    ctx += `SECRET — the correct option is (${order.indexOf(q.answer) + 1}) "${q.options[q.answer]}". Explanation for you: ${q.explain}\n`;
    ctx += req.questionSolved
      ? "The learner has ALREADY SOLVED this question, so you may now explain the reasoning fully.\n"
      : "The learner has NOT solved it yet: never state, spell out, point to or confirm the correct option, and never eliminate options down to one. Guide their thinking instead.\n";
    ctx += `Pre-written hints you can build on, in order: 1) ${q.hints[0]} 2) ${q.hints[1]} 3) ${q.hints[2]}\n`;
  }
  ctx += `\nThe learner's nickname is ${req.nickname}.`;
  return ctx;
}

const SAFETY_SCHEMA = {
  type: "object",
  properties: {
    safe_for_age: { type: "boolean", description: "True if the reply is appropriate, kind and safe for a learner of this age." },
    reveals_answer: {
      type: "boolean",
      description: "True if the reply states, confirms, points to, or narrows down to the correct option of an unsolved question, or solves the learner's homework for them.",
    },
    reason: { type: "string" },
  },
  required: ["safe_for_age", "reveals_answer", "reason"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface TutorProvider {
  reply(req: TutorRequest): Promise<TutorResult>;
}

/** Fallback used when the model output is rejected: the lesson's own pre-written hint. */
export function safeHint(req: TutorRequest): string {
  if (req.questionIndex === null) {
    return "Let's look at the lesson together again. What part feels tricky? Tell me in your own words. 🦉";
  }
  const q = req.lesson.quiz[req.questionIndex]!;
  const asked = req.history.filter((t) => t.role === "user").length; // turns so far on this lesson
  return `Here's a hint: ${q.hints[Math.min(asked, 2)]}`;
}

export class MockTutor implements TutorProvider {
  async reply(req: TutorRequest): Promise<TutorResult> {
    return { reply: safeHint(req), flag: null };
  }
}

export class ClaudeTutor implements TutorProvider {
  constructor(private client = new Anthropic()) {}

  async reply(req: TutorRequest): Promise<TutorResult> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...req.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: req.message },
    ];

    let draft: string;
    try {
      const response = await this.client.beta.messages.create({
        model: config.tutor.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: config.tutor.effort },
        cache_control: { type: "ephemeral" },
        system: [
          { type: "text", text: tutorSystemPrompt(req.band) },
          { type: "text", text: lessonContext(req) },
        ],
        messages,
      });
      if (response.stop_reason === "refusal") return { reply: safeHint(req), flag: "refusal" };
      draft = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!draft) return { reply: safeHint(req), flag: "error" };
    } catch (err) {
      console.error("tutor call failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
      return { reply: safeHint(req), flag: "error" };
    }

    // Second pass: an independent check of the reply before a child sees it.
    const verdict = await this.check(req, draft);
    if (!verdict) return { reply: safeHint(req), flag: "error" };
    if (!verdict.safe_for_age) return { reply: safeHint(req), flag: "unsafe_reply" };
    if (verdict.reveals_answer && !req.questionSolved) return { reply: safeHint(req), flag: "answer_leak" };
    return { reply: draft, flag: null };
  }

  private async check(
    req: TutorRequest,
    draft: string,
  ): Promise<{ safe_for_age: boolean; reveals_answer: boolean; reason: string } | null> {
    try {
      const response = await this.client.beta.messages.create({
        model: config.tutor.safetyModel,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: SAFETY_SCHEMA as unknown as Record<string, unknown> },
        },
        system:
          "You review replies written by a tutoring assistant for children before they are shown. Judge only the REPLY. Be strict about age-appropriateness and about revealing quiz answers.",
        messages: [
          {
            role: "user",
            content: `${BAND_STYLE[req.band]}\n\n<lesson_context>\n${lessonContext(req)}\n</lesson_context>\n\n<learner_message>\n${req.message}\n</learner_message>\n\n<reply>\n${draft}\n</reply>`,
          },
        ],
      });
      if (response.stop_reason === "refusal") return null;
      const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.error("safety check failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
      return null;
    }
  }
}

export function createTutor(): TutorProvider {
  return config.tutor.mode === "claude" ? new ClaudeTutor() : new MockTutor();
}
