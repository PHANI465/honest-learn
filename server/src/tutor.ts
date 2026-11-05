import Anthropic from "@anthropic-ai/sdk";
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
// ---------------------------------------------------------------------------

const PERSONAL_INFO = [
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email
  /(\+?\d[\d\s().-]{7,}\d)/, // phone-like number
  /\b(i live (at|on|in)|my address is|my (home|house) is at)\b/i,
  /\b(my (school|password) is)\b/i,
];

const WELLBEING = [
  /\b(kill myself|want to die|hurt myself|self[- ]?harm|suicide|end my life)\b/i,
  /\b(someone (is )?(hurting|touching) me|being abused|abuse me)\b/i,
];

export function precheck(message: string, band: BandId): TutorResult | null {
  if (WELLBEING.some((r) => r.test(message))) {
    return {
      reply:
        band === "b2" || band === "b1"
          ? "Thank you for telling me. This is really important. Please tell a grown-up you trust right now, like a parent or teacher. You are not alone. 💛"
          : "Thank you for telling me — that took courage. I'm a learning helper, so I can't help with this the way a person can. Please talk to a trusted adult right now (a parent, teacher or school counsellor). If you are in danger, call your local emergency number. Many countries also have a free children's helpline — a trusted adult can help you find yours. You matter. 💛",
      flag: "wellbeing",
    };
  }
  if (PERSONAL_INFO.some((r) => r.test(message))) {
    return {
      reply:
        "Let's keep that private! 🔒 Never share things like your address, phone number, email, school or passwords online — not even with me. Can you ask your question again without it?",
      flag: "personal_info",
    };
  }
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
