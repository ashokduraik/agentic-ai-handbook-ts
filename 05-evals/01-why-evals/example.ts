/**
 * Post 01 — Why evals?   (read the blog post first: 01-why-evals/README.md)
 *
 * Lesson 04 left an open question: does the LLM reranker help or hurt? Opinions differ; let's MEASURE.
 * For every answerable golden question, retrieve with hybrid search, then compare
 *   A. hybrid order as-is   (RERANKER=none)
 *   B. hybrid top 6 → llmRerank → top 3   (RERANKER=llm)
 * on two numbers: hit@1 (right document first) and hit@3 (right document in the top 3).
 * No answers are generated: retrieval is the cheapest thing to measure, and the first to check.
 *
 * Run: npx tsx 01-why-evals/example.ts            (EMBED_MODEL, and CHAT_MODEL as the reranker)
 *      npx tsx 01-why-evals/example.ts --offline  (fake embeddings + a word-overlap "reranker")
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { embed } from 'ai';
import { DOCS_DIR, HybridStore, chunkMarkdown, ingestDir, llmRerank, type Hit } from '@learn/rag';
import { fakeEmbed, fakeJudge } from '@learn/rag/offline-fakes';
import { chatModel, dump, embeddingModel, modelLabel, section } from '@learn/shared';
import { cases } from '../02-golden-dataset/dataset.ts';

const offline = process.argv.includes('--offline');
const store = new HybridStore(); // in-memory, rebuilt every run
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
} else await ingestDir(store);

const reranker = offline ? fakeJudge() : chatModel();
const hit = (hits: Hit[], source: string, k: number) => hits.slice(0, k).some((h) => h.source === source);
const score = { none: { hit1: 0, hit3: 0 }, llm: { hit1: 0, hit3: 0 } };
const answerable = cases.filter((c) => c.answerable && c.expectedSource);

section(`Retrieval on ${answerable.length} golden questions (reranker: ${offline ? 'offline fake' : modelLabel()})`);
for (const c of answerable) {
  const vector = offline ? fakeEmbed(c.question) : (await embed({ model: embeddingModel(), value: c.question })).embedding;
  const candidates = store.hybridSearch(c.question, vector, 6);
  const reranked = await llmRerank(reranker, c.question, candidates, 3);
  for (const [mode, hits] of [['none', candidates], ['llm', reranked]] as const) {
    score[mode].hit1 += Number(hit(hits, c.expectedSource!, 1));
    score[mode].hit3 += Number(hit(hits, c.expectedSource!, 3));
  }
  console.log(`  ${c.id.padEnd(24)} none: ${candidates[0]?.source.padEnd(28)} llm: ${reranked[0]?.source}`);
  if (c === answerable[0]) {
    // Both rankings for the FIRST question only, as `score  heading` lines (the full `Hit` shape is in
    // lesson 04, posts 04-06). Notice `score`: RRF before reranking, 0-10 after. hit@k only asks whether
    // c.expectedSource is among the first k hits.
    const brief = (hits: Hit[]) => hits.forEach((h, i) => console.log(`      ${i + 1}. ${h.score.toFixed(3)}  ${h.heading}`));
    console.log(`    hybrid candidates (expected: ${c.expectedSource}):`);
    brief(candidates);
    console.log('    llmRerank() top 3:');
    brief(reranked);
  }
}

section('The numbers');
// The raw counts behind the table: how many of the questions had the right doc at rank 1 / in the top 3.
dump('hit counts', { questions: answerable.length, ...score });
const pct = (n: number) => `${Math.round((100 * n) / answerable.length)}%`;
console.table({
  'RERANKER=none': { 'hit@1': pct(score.none.hit1), 'hit@3': pct(score.none.hit3) },
  'RERANKER=llm': { 'hit@1': pct(score.llm.hit1), 'hit@3': pct(score.llm.hit3) },
});
