// What a child is told when Hoot is not the safety-tested helper. Pure (no React Native imports) so server/test/hoot-notice.test.ts runs it.
//
// The server says which helper answers (helperFor in server/src/ai-settings.ts): "default" has been through the project's safety test
// set; "family" is a model a parent connected; "server" is a model whoever runs the server chose. For the last two the chat screen shows
// this notice. It is written for a child: no model names, no jargon, nothing frightening, and always where to go with a worry.

export interface HootHelper {
  source: "default" | "family" | "server";
  safetyTested: boolean;
}

/** The notice to show above the chat, or null when the helper is the safety-tested one (or the server did not say). */
export function helperNotice(helper: unknown): string | null {
  const h = helper as Partial<HootHelper> | null | undefined;
  if (!h || typeof h !== "object") return null;
  if (h.safetyTested === true && h.source === "default") return null;
  const who = h.source === "family" ? "a helper your grown-up set up" : "a different helper";
  return `This Hoot is using ${who}. Honest Learn has not tested it, so it can make more mistakes than usual. If a reply seems odd, wrong or unkind, tell a grown-up.`;
}
