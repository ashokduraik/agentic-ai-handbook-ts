/**
 * Post 06 — Reranking   (read the blog post first: 06-reranking/README.md)
 *
 * Retrieval is tuned for RECALL: get the right chunk somewhere in the top 6.
 * A reranker is tuned for PRECISION: read the question and each candidate TOGETHER and put the best 3 on top.
 * We take the hybrid top 6 from post 05 and rerank them with pipeline/rerank.ts's llmRerank
 * (any chat model scores each passage 0-10 with structured output).
 *
 * Run: npx tsx 06-reranking/example.ts ["your question"]   (EMBED_MODEL + CHAT_MODEL, data/rag.db from post 04)
 *      npx tsx 06-reranking/example.ts --offline          (fake embeddings + a word-overlap "judge")
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embed } from 'ai';
import { chatModel, dump, embeddingModel, modelLabel, section } from '@learn/shared';
import { DOCS_DIR, chunkMarkdown, llmRerank, openStore } from '../pipeline/rag.ts';
import { fakeEmbed, fakeJudge } from '../pipeline/offline-fakes.ts';

const offline = process.argv.includes('--offline');
const question = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'Can I get my discharge summary the same day I leave?';

const store = openStore(offline ? ':memory:' : undefined);
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
}
if (!store.count()) throw new Error('Empty store: run post 04 first (npm run post:04) or npm run ingest');

// 1. Retrieve generously: 6 candidates from hybrid search (cheap, fast, recall-oriented).
const queryVector = offline ? fakeEmbed(question) : (await embed({ model: embeddingModel(), value: question })).embedding;
const candidates = store.hybridSearch(question, queryVector, 6);
section(`1. Hybrid candidates for "${question}"`);
candidates.forEach((c, i) => console.log(`  ${i + 1}. rrf=${c.score.toFixed(4)}  ${c.heading}`));

// 2. Rerank: one small judge call per candidate, in parallel. Keep the best 3.
const judge = offline ? fakeJudge() : chatModel();
section(`2. After llmRerank (judge: ${offline ? 'offline word-overlap fake' : modelLabel()})`);
const t0 = performance.now();
const top = await llmRerank(judge, question, candidates, 3);
top.forEach((c, i) => console.log(`  ${i + 1}. relevance=${c.score}/10  ${c.heading}`));
// The full llmRerank() result: the same Hit objects as the candidates, but `score` is now the judge's
// 0-10 relevance (or -1 if its reply could not be parsed), and only the best 3 are kept.
dump('llmRerank() result', top);
console.log(`  (${candidates.length} judge calls, ${Math.round(performance.now() - t0)} ms)`);
