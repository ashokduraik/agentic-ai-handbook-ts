/**
 * Post 06 walks through this file.
 *
 * Reranking: retrieval is optimised for RECALL (get the right chunk somewhere in the top 10);
 * a reranker optimises PRECISION (put the best 3 on top) by reading query + chunk TOGETHER.
 *
 * Two generic options:
 *  1. llmRerank — any chat model scores each candidate 0–10 with structured output.
 *     Works everywhere, costs N small LLM calls. Good default for learning.
 *  2. modelRerank — a dedicated reranking (cross-encoder) model through the AI SDK's `rerank()`,
 *     e.g. Cohere or Bedrock reranking models (`cohere.reranking('...')`). Faster/cheaper at scale.
 */
import { generateText, Output, rerank, type LanguageModel, type RerankingModel } from 'ai';
import { z } from 'zod';
import type { Hit } from './store.ts';

const Relevance = z.object({
  score: z.int().min(0).max(10).describe('integer 0-10: 0 = unrelated, 10 = directly answers the question'),
});

export async function llmRerank(model: LanguageModel, query: string, hits: Hit[], topN = 3): Promise<Hit[]> {
  const scored = await Promise.all(
    hits.map(async (hit) => {
      try {
        const { output } = await generateText({
          model,
          output: Output.object({ schema: Relevance }),
          temperature: 0,
          maxOutputTokens: 512,
          prompt: `Rate how well the passage helps answer the question.\nQuestion: ${query}\nPassage (${hit.heading}): ${hit.text}`,
        });
        return { ...hit, score: output.score };
      } catch {
        return { ...hit, score: -1 }; // unparseable judgement → push to the bottom, don't crash
      }
    }),
  );
  // Array.sort is stable: ties keep the retrieval order, so a weak/indecisive judge can't
  // shuffle good results randomly. Whether reranking HELPS is an empirical question —
  // measure it with evals (05) on your data and model before turning it on in production.
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

export async function modelRerank(model: RerankingModel, query: string, hits: Hit[], topN = 3): Promise<Hit[]> {
  const { ranking } = await rerank({ model, query, documents: hits.map((h) => `${h.heading}\n${h.text}`), topN });
  return ranking.map((r) => ({ ...hits[r.originalIndex]!, score: r.score }));
}
