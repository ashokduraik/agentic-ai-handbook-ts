/**
 * Post 02 — Chunking   (read the blog post first: 02-chunking/README.md)
 *
 * Before we can search documents we cut them into chunks: the unit we embed, retrieve and cite.
 * Compare two chunkers on the same policy:
 *   1. naive fixed-size windows   — cuts mid-sentence, loses which section a sentence belongs to
 *   2. heading-aware (the pipeline's chunkMarkdown) — one chunk per section, labelled "Doc › Section"
 * and see how overlap protects a fact that sits on a window boundary.
 *
 * No model needed. Run: npx tsx 02-chunking/example.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dump, section } from '@learn/shared';
import { DOCS_DIR, chunkMarkdown } from '../pipeline/rag.ts';

const policy = readFileSync(join(DOCS_DIR, 'visiting-hours.md'), 'utf8');
const preview = (t: string) => JSON.stringify(t.slice(0, 70)) + (t.length > 70 ? '…' : '');

// 1. The naive way: every 200 characters, no matter what.
section('1. Naive: fixed 200-character windows');
for (let start = 0; start < policy.length; start += 200) {
  console.log(`  chunk @${String(start).padStart(3)}: ${preview(policy.slice(start, start + 200))}`);
}

// 2. Heading-aware: split on markdown headings, keep the heading as a label (and a citation).
section('2. Heading-aware: chunkMarkdown(source, markdown)');
const chunks = chunkMarkdown('visiting-hours.md', policy);
for (const c of chunks) {
  console.log(`  ${c.id.padEnd(22)} ${c.heading}\n  ${''.padEnd(22)} ${preview(c.text)}`);
}
// The full chunkMarkdown() result. Notice each Chunk is { id, source, heading, text }: `id` is
// "file#index" (stable, so re-ingesting replaces rows instead of duplicating them), and `text`
// no longer contains the heading line: the heading travels separately, as a label and a citation.
dump('chunkMarkdown() result', chunks);

// 3. Long sections still need size limits. Overlap repeats the end of one window at the start of the next.
section('3. A long section with small windows: maxChars=160, overlap=40');
const icu = chunkMarkdown('visiting-hours.md', policy, 160, 40).filter((c) => c.heading.includes('ICU'));
icu.forEach((c, i) => console.log(`  window ${i}: ${JSON.stringify(c.text)}`));
// Both windows of the long section. Notice they share the same `heading` (each window can still be
// cited as "ICU…") but get their own `id`.
dump('ICU windows (maxChars=160, overlap=40)', icu);
console.log('\n  ↑ the last 40 characters of window 0 are repeated at the start of window 1, so the rule');
console.log('    "Children under 12 may not visit…", cut in half in window 0, is whole in window 1.');
