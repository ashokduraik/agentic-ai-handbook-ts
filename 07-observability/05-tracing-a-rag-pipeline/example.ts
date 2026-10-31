/**
 * Post 05 — Tracing a RAG pipeline: one span per stage, quality signals on the spans
 * (read the blog post first: 05-tracing-a-rag-pipeline/README.md)
 *
 *   A tiny, self-contained RAG over four clinic policy snippets (the full pipeline is lesson 04):
 *     rag.request
 *       ├─ rag.retrieve   embed the question + docs, rank by cosine similarity → top 2
 *       │    └─ (AI SDK embed spans)
 *       └─ rag.generate   answer from the top 2 with [doc-id] citations, then check the citations
 *            └─ (AI SDK chat spans)
 *   Retrieval quality (top score, candidates) and answer quality (citations valid) go on the spans,
 *   so a slow or wrong answer can be traced to the stage that caused it.
 *
 * Run:  npx tsx 05-tracing-a-rag-pipeline/example.ts ["your question"]   (EMBED_MODEL + CHAT_MODEL)
 *       npx tsx 05-tracing-a-rag-pipeline/example.ts --offline           (fake models)
 */
import { cosineSimilarity, embed, embedMany, generateText, registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT } from '@opentelemetry/semantic-conventions/incubating';
import { chatModel, dump, embeddingModel, section, stripThinking } from '@learn/shared';
import { setupTracing } from '../01-traces-and-spans/tracing.ts';
import { scriptedModel, wordEmbeddingModel } from '../support/mock.ts';

const offline = process.argv.includes('--offline');
const { tracer, shutdown } = setupTracing('07-post-05');
registerTelemetry(new OpenTelemetry({ tracer }));

const docs = [
  { id: 'visiting', text: 'Visiting hours are 10:00 to 20:00. Two visitors per patient at a time.' },
  { id: 'no-show', text: 'A no-show deposit of 50 SAR is charged when an appointment is missed without 24 hours notice.' },
  { id: 'parking', text: 'Outpatient parking is in building C. The first two hours are free.' },
  { id: 'pharmacy', text: 'The outpatient pharmacy is open from 08:00 to 22:00, including weekends.' },
];

const question = process.argv.slice(2).filter((a) => a !== '--offline').join(' ') || 'How much is the no-show deposit?';
const embedder = offline ? wordEmbeddingModel() : embeddingModel();
const generator = offline ? scriptedModel({ text: 'The no-show deposit is 50 SAR [no-show].' }) : chatModel();

await tracer.startActiveSpan('rag.request', async (root) => {
  try {
    // Stage 1: retrieval. The span records HOW GOOD the retrieval looked, not just how long it took.
    const top = await tracer.startActiveSpan('rag.retrieve', async (span) => {
      span.setAttribute(ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT, question); // fine here: a policy question, not PHI
      const many = await embedMany({ model: embedder, values: docs.map((d) => d.text) }); // in real RAG: done at ingest time
      // The full embedMany() / embed() results are in lesson 01, post 06. We log just the vector count and size,
      // and `usage.tokens`: the AI SDK puts the same token count on its embed span.
      const { embeddings } = many;
      console.log(`embedMany: ${embeddings.length} vectors of ${embeddings[0]!.length} numbers, usage.tokens=${many.usage.tokens}`);
      const one = await embed({ model: embedder, value: question });
      console.log(`embed: 1 vector of ${one.embedding.length} numbers, usage.tokens=${one.usage.tokens}`);
      const { embedding } = one;
      const ranked = docs
        .map((d, i) => ({ ...d, score: cosineSimilarity(embedding, embeddings[i]!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      // The retrieval hits: what the app.top_ids / app.top_score attributes below summarise.
      dump('top 2 hits', ranked);
      span.setAttributes({ 'app.candidates': docs.length, 'app.top_ids': ranked.map((d) => d.id), 'app.top_score': Number(ranked[0]!.score.toFixed(3)) });
      span.end();
      return ranked;
    });

    // Stage 2: generation, with a cheap quality check recorded on the span.
    const answer = await tracer.startActiveSpan('rag.generate', async (span) => {
      const result = await generateText({
        model: generator,
        instructions: 'Answer only from the sources. Cite the source id in square brackets, e.g. [parking]. If the sources do not answer, say so.',
        prompt: `Sources:\n${top.map((d) => `[${d.id}] ${d.text}`).join('\n')}\n\nQuestion: ${question}`,
        maxOutputTokens: 512,
      });
      // The full generateText result is in lesson 01, post 00. The citations check below reads only `text`;
      // here we log the usage.
      console.log(`generateText: inputTokens=${result.usage.inputTokens} outputTokens=${result.usage.outputTokens}`);
      const { text } = result;
      const cited = [...stripThinking(text).matchAll(/\[([\w-]+)\]/g)].map((m) => m[1]!);
      const valid = cited.length > 0 && cited.every((id) => top.some((d) => d.id === id)); // cited only what we retrieved?
      span.setAttributes({ 'app.citations': cited, 'app.citations_valid': valid });
      span.end();
      return stripThinking(text);
    });

    section('Answer');
    console.log(answer);
  } finally {
    root.end();
  }
});
await shutdown();
