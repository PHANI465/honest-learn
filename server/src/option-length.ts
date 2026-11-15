// Quiz options: a length cue a child can use without reading the question.
//
// If the correct option is clearly the longest, children learn to pick the longest and never read the question. Being longest by a
// letter or two is not a cue anyone can use (and, by chance, the correct option is the strictly longest about a third of the time with
// three options), so only a clear gap counts: at least MIN_GAP characters AND at least MIN_RATIO times the next longest option.
// The validator (validate-content.ts) warns about these, and test/option-length.test.ts keeps the shipped content free of them.

/** Characters (not UTF-16 units: an emoji counts as one) the correct option must be ahead by to count as a cue. */
export const MIN_GAP = 6;
/** How many times as long as the longest wrong option it must also be. */
export const MIN_RATIO = 1.3;

const len = (s: string) => [...s].length;

/** Whether the correct option is the strictly longest, however slightly. Everything else about a question is ignored. */
export function isStrictlyLongest(options: readonly string[], answer: number): boolean {
  const best = Math.max(...options.map(len));
  return len(options[answer]!) === best && options.filter((o) => len(o) === best).length === 1;
}

/** The gap and ratio when the correct option is clearly the longest, or null when its length gives nothing away. */
export function lengthCue(options: readonly string[], answer: number): { gap: number; ratio: number } | null {
  const correct = len(options[answer]!);
  const longestWrong = Math.max(...options.filter((_, i) => i !== answer).map(len));
  const gap = correct - longestWrong;
  const ratio = longestWrong === 0 ? Infinity : correct / longestWrong;
  return gap >= MIN_GAP && ratio >= MIN_RATIO ? { gap, ratio } : null;
}
