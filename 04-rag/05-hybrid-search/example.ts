/**
 * Post 05 — Hybrid search: keywords + vectors   (read the blog post first: 05-hybrid-search/README.md)
 *
 * Vector search understands MEANING ("kid" ≈ "children") but is weak on exact tokens (amounts, codes, drug names).
 * Keyword search (BM25 over SQLite FTS5) is the opposite. Hybrid search runs both and merges the two rankings
 * with Reciprocal Rank Fusion (RRF). We run two questions, one of each kind, through all three.
 *
 * Run: npx tsx 05-hybrid-search/example.ts ["your question"]   (uses EMBED_MODEL + data/rag.db from post 04)
 *      npx tsx 05-hybrid-search/example.ts --offline          (fake embeddings, in-memory store)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embed } from 'ai';
import { dump, embeddingModel, section } from '@learn/shared';
import { DOCS_DIR, chunkMarkdown, openStore, type Hit } from '../pipeline/rag.ts';
import { fakeEmbed } from '../pipeline/offline-fakes.ts';

const offline = process.argv.includes('--offline');
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
const questions = asked ? [asked] : ['can my kid visit grandpa in intensive care?', 'SAR 100 deposit'];

const store = openStore(offline ? ':memory:' : undefined);
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
}
if (!store.count()) throw new Error('Empty store: run post 04 first (npm run post:04) or npm run ingest');

const print = (hits: Hit[]) => hits.forEach((h, i) => console.log(`    ${i + 1}. ${h.score.toFixed(4)}  ${h.heading}`));

for (const q of questions) {
  const queryVector = offline ? fakeEmbed(q) : (await embed({ model: embeddingModel(), value: q })).embedding;
  section(`"${q}"`);
  console.log('  Vector (cosine): meaning');
  const vector = store.vectorSearch(queryVector, 3);
  print(vector);
  console.log('  Keyword (BM25): exact words only');
  const keyword = store.keywordSearch(q, 3);
  print(keyword);
  console.log('  Hybrid (RRF of both)');
  const hybrid = store.hybridSearch(q, queryVector, 3);
  print(hybrid);
  // The best hit of each search, in full. Notice the three `score` scales have nothing in common:
  // cosine (about 0-1), BM25 (bigger = better, unbounded) and RRF (tiny: 1/(60 + position), summed over both lists).
  // That is why hybrid search fuses RANKS, never raw scores. `undefined` = no keyword match at all.
  dump('best hit per search', { vector: vector[0], keyword: keyword[0], hybrid: hybrid[0] });
}
