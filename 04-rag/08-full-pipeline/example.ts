/**
 * Post 08 — The full pipeline   (read the blog post first: 08-full-pipeline/README.md)
 *
 * A small CLI over pipeline/rag.ts, the module lessons 05 and 09 import as `@learn/rag`:
 *   ingest  docs/*.md → data/rag.db                      (npm run ingest)
 *   search  "<q>"  vector vs keyword vs hybrid             (npm run search -- "<q>")
 *   ask     "<q>"  retrieve → rerank → cited answer        (npm run ask -- "<q>")
 *
 * Run: npx tsx 08-full-pipeline/example.ts ingest
 *      npx tsx 08-full-pipeline/example.ts ask "How many no-shows before I need a deposit?"
 *      RERANKER=none npx tsx 08-full-pipeline/example.ts ask "What is the hospital's parking fee?"
 */
import { embed } from 'ai';
import { embeddingModel, section, stripThinking } from '@learn/shared';
import { DB_PATH, answer, ingestDir, openStore, retrieve, type Hit } from '../pipeline/rag.ts';

const [command = 'ask', ...rest] = process.argv.slice(2);
const question = rest.join(' ') || 'How many no-shows before a deposit is required, and how much is it?';
const store = openStore();

if (command === 'ingest') {
  section(`Ingest docs/*.md → ${DB_PATH}`);
  const t0 = performance.now();
  const n = await ingestDir(store);
  console.log(`embedded ${n} chunks in ${Math.round(performance.now() - t0)} ms; store now has ${store.count()} chunks`);
  process.exit(0);
}

if (!store.count()) throw new Error('Empty store: run `npm run ingest` first');

if (command === 'search') {
  const { embedding } = await embed({ model: embeddingModel(), value: question });
  const print = (hits: Hit[]) => hits.forEach((h, i) => console.log(`  ${i + 1}. ${h.score.toFixed(4)}  ${h.heading}`));
  section(`Vector — "${question}"`);
  print(store.vectorSearch(embedding, 4));
  section('Keyword (BM25)');
  print(store.keywordSearch(question, 4));
  section('Hybrid (RRF)');
  print(store.hybridSearch(question, embedding, 4));
} else {
  // ask: the whole pipeline in two calls
  section('Retrieve + rerank');
  const t0 = performance.now();
  const { candidates, top } = await retrieve(store, question); // hybrid top 6 → rerank (RERANKER=llm|none) → top 3
  candidates.forEach((c, i) => console.log(`  ${i + 1}. rrf=${c.score.toFixed(4)} ${c.heading}`));
  console.log(`after rerank (RERANKER=${process.env.RERANKER ?? 'llm'}):`);
  top.forEach((c, i) => console.log(`  [${i + 1}] score=${c.score.toFixed(3)} ${c.heading}`));
  console.log(`  (${Math.round(performance.now() - t0)} ms)`);

  section('Answer');
  const a = await answer(question, top); // grounded, cited, may refuse
  console.log(stripThinking(a.answer));
  console.log({ answerable: a.answerable, citations: a.citations, citationsValid: a.citationsValid });
}
