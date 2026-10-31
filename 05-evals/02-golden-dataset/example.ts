/**
 * Post 02 — A golden dataset   (read the blog post first: 02-golden-dataset/README.md)
 *
 * Prints the dataset and LINTS it, with no model: a broken test case is worse than none,
 * because it fails good answers or passes bad ones. We check that:
 *   - every expectedSource is a real file in 04-rag/docs
 *   - every answerable case has something to check (mustContain / mustContainAll / reference)
 *   - every unanswerable case has NO facts to look for
 *   - every mustContain / mustContainAll value actually appears in the expected document
 *     (or the reference answer), so the check isn't impossible to pass
 *
 * Run: npx tsx 02-golden-dataset/example.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_DIR } from '@learn/rag';
import { dump, section } from '@learn/shared';
import { cases } from './dataset.ts';

section(`${cases.length} cases`);
console.table(
  cases.map((c) => ({
    id: c.id,
    answerable: c.answerable,
    anyOf: c.mustContain?.join(' | ') ?? '',
    allOf: c.mustContainAll?.join(' + ') ?? '',
    source: c.expectedSource ?? '',
  })),
);

// Two raw cases, as the harness sees them. Notice which optional fields each kind uses: an answerable
// case has facts to check (mustContain/mustContainAll), a source and a reference; a must-refuse case has none.
dump('an answerable case', cases[0]);
dump('a must-refuse case', cases.find((c) => !c.answerable));

section('Lint');
const docs = new Set(readdirSync(DOCS_DIR));
const problems: string[] = [];
for (const c of cases) {
  const facts = [...(c.mustContain ?? []), ...(c.mustContainAll ?? [])];
  if (c.expectedSource && !docs.has(c.expectedSource)) problems.push(`${c.id}: no such doc ${c.expectedSource}`);
  if (c.answerable && !facts.length && !c.reference) problems.push(`${c.id}: answerable but nothing to check`);
  if (!c.answerable && facts.length) problems.push(`${c.id}: unanswerable cases must not require facts`);
  if (c.expectedSource && docs.has(c.expectedSource)) {
    const truth = `${readFileSync(join(DOCS_DIR, c.expectedSource), 'utf8')} ${c.reference ?? ''}`.toLowerCase();
    if (c.mustContain && !c.mustContain.some((f) => truth.includes(f.toLowerCase())))
      problems.push(`${c.id}: none of mustContain [${c.mustContain}] appears in ${c.expectedSource} or the reference`);
    for (const f of c.mustContainAll ?? [])
      if (!truth.includes(f.toLowerCase())) problems.push(`${c.id}: "${f}" appears in neither ${c.expectedSource} nor the reference`);
  }
}
const unanswerable = cases.filter((c) => !c.answerable).length;
console.log(`${cases.length - unanswerable} answerable, ${unanswerable} must-refuse`);
console.log(problems.length ? problems.map((p) => `❌ ${p}`).join('\n') : '✅ dataset is consistent');
// The lint result itself: an empty list means every case can be checked and every fact exists in its doc.
dump('lint problems', problems);
if (problems.length) process.exitCode = 1;
