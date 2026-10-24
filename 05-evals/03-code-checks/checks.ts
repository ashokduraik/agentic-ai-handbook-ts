/**
 * Cheap, deterministic checks (post 03). No model, so they are free, fast and never flaky.
 * They catch the obvious failures; they can't judge meaning (post 04 does that).
 */
import type { EvalCase } from '../02-golden-dataset/dataset.ts';

/** Whole-word, case-insensitive match: "no" must not match "noon" or "notify". */
export function containsWord(text: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}
export const containsAny = (text: string, needles: string[]) => needles.some((n) => containsWord(text, n));
export const containsAll = (text: string, needles: string[]) => needles.every((n) => containsWord(text, n));

/** What the app returned for one case: the answer plus what it retrieved. */
export interface AppResult {
  answer: string;
  answerable: boolean;
  citationsValid: boolean;
  sources: string[]; // retrieved sources, best first
}

/** Every check returns true/false, or null when it doesn't apply to this case. */
export function codeChecks(c: EvalCase, r: AppResult) {
  return {
    hit3: c.expectedSource ? r.sources.slice(0, 3).includes(c.expectedSource) : null, // retrieval
    refusalOk: r.answerable === c.answerable, // answered when it should, refused when it should
    contains: c.answerable && c.mustContain?.length ? containsAny(r.answer, c.mustContain) : null,
    containsAll: c.answerable && c.mustContainAll?.length ? containsAll(r.answer, c.mustContainAll) : null,
    citations: c.answerable ? r.citationsValid : null,
  };
}
