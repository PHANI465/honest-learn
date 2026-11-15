// Hoot on Claude (the project's default helper) and the choice of provider from the settings. Server only: the Anthropic SDK
// is not part of the phone app. The rules every provider shares live in tutor.ts.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import {
  BAND_STYLE,
  lessonContext,
  MockTutor,
  SAFETY_SCHEMA,
  safeHint,
  singlesOutCorrectOption,
  tutorSystemPrompt,
  type TutorProvider,
  type TutorRequest,
  type TutorResult,
} from "./tutor.ts";
import { OpenAICompatTutor } from "./tutor-openai.ts";

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
        max_tokens: config.tutor.maxReplyTokens,
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
    if (singlesOutCorrectOption(req, draft)) return { reply: safeHint(req), flag: "answer_leak" };
    return { reply: draft, flag: null };
  }

  private async check(
    req: TutorRequest,
    draft: string,
  ): Promise<{ safe_for_age: boolean; reveals_answer: boolean; reason: string } | null> {
    try {
      const response = await this.client.beta.messages.create({
        model: config.tutor.safetyModel,
        max_tokens: config.tutor.maxCheckTokens,
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
  if (config.tutor.mode === "claude") return new ClaudeTutor();
  if (config.tutor.mode === "openai") return new OpenAICompatTutor();
  return new MockTutor();
}
