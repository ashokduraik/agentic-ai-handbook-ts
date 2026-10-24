/**
 * Deterministic checks of the pipeline's non-LLM parts (chunker, FTS, RRF, re-ingest, citation check).
 * Uses a fake bag-of-words "embedding" so it runs with no model. Run: npx tsx pipeline/offline-test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_DIR, HybridStore, checkCitations, chunkMarkdown } from './rag.ts';
import { fakeEmbed } from './offline-fakes.ts';

const chunks = ['visiting-hours.md', 'appointment-cancellation.md', 'medication-refill.md'].flatMap((f) =>
  chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')),
);
assert.ok(chunks.length >= 9, 'heading-aware chunking');
assert.ok(chunks.some((c) => c.heading.includes('›')), 'headings carry the document title');

const store = new HybridStore();
store.upsert(chunks, chunks.map((c) => fakeEmbed(c.heading + c.text)));
const kw = store.keywordSearch('SAR deposit');
assert.match(kw[0]!.heading, /no-shows/i, 'BM25 finds exact term');
const hy = store.hybridSearch('ICU children visit', fakeEmbed('icu children visit'));
assert.match(hy[0]!.heading, /Intensive Care/i, 'hybrid ranks ICU first');

store.clear();
assert.equal(store.count(), 0, 'clear() empties vectors');
assert.equal(store.keywordSearch('deposit').length, 0, 'clear() empties the keyword index');

assert.equal(checkCitations({ answer: 'x [1]', citations: [1], answerable: true }, 3).citationsValid, true);
assert.equal(checkCitations({ answer: 'x [7]', citations: [], answerable: true }, 3).citationsValid, false);
assert.equal(checkCitations({ answer: 'no idea', citations: [], answerable: true }, 3).citationsValid, false);
console.log(`✓ offline RAG checks passed (${chunks.length} chunks)`);
