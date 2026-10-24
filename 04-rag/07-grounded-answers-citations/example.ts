/**
 * Post 07 — Grounded answers with citations   (read the blog post first: 07-grounded-answers-citations/README.md)
 *
 * The "G" in RAG, done carefully:
 *   - number the sources and make the model cite them: [1], [2]
 *   - structured output: { answer, citations, answerable }
 *   - REFUSE when the sources don't contain the answer (answerable=false), instead of guessing
 *   - CHECK the citations in code: they must point at sources that exist
 * Two questions: one the docs answer (no-show deposit), one they don't (parking fee).
 *
 * Run: npx tsx 07-grounded-answers-citations/example.ts            (EMBED_MODEL + CHAT_MODEL, data/rag.db)
 *      npx tsx 07-grounded-answers-citations/example.ts --offline  (fake retrieval + canned model replies)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embed } from 'ai';
import { embeddingModel, modelLabel, section, stripThinking } from '@learn/shared';
import { DOCS_DIR, answer, checkCitations, chunkMarkdown, openStore } from '../pipeline/rag.ts';
import { cannedModel, fakeEmbed } from '../pipeline/offline-fakes.ts';

const offline = process.argv.includes('--offline');
const store = openStore(offline ? ':memory:' : undefined);
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
}
if (!store.count()) throw new Error('Empty store: run post 04 first (npm run post:04) or npm run ingest');

const questions = [
  {
    q: 'How many no-shows before a deposit is required, and how much is it?',
    offlineReply: { answer: 'After three no-shows in 12 months a SAR 100 deposit is required [1].', citations: [1], answerable: true },
  },
  {
    q: "What is the hospital's parking fee?",
    offlineReply: { answer: 'The sources do not say what parking costs.', citations: [], answerable: false },
  },
];

for (const { q, offlineReply } of questions) {
  section(q);
  const queryVector = offline ? fakeEmbed(q) : (await embed({ model: embeddingModel(), value: q })).embedding;
  const contexts = store.hybridSearch(q, queryVector, 3); // reranking skipped here to keep the post focused
  contexts.forEach((c, i) => console.log(`  source [${i + 1}] ${c.source} — ${c.heading}`));

  const a = await answer(q, contexts, offline ? cannedModel(offlineReply) : undefined); // undefined → chatModel()
  console.log(`\n  answer (${offline ? 'canned' : modelLabel()}): ${stripThinking(a.answer)}`);
  console.log(`  answerable=${a.answerable}  citations=${JSON.stringify(a.citations)}  citationsValid=${a.citationsValid}`);
}

section('checkCitations catches bad citations, in code');
console.log('cites [7] of 3 sources →', checkCitations({ answer: 'Deposit is SAR 100 [7].', citations: [7], answerable: true }, 3));
console.log('claims an answer, cites nothing →', checkCitations({ answer: 'Deposit is SAR 100.', citations: [], answerable: true }, 3));
