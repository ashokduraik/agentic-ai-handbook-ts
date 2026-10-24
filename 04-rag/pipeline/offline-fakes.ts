/**
 * Fakes for offline runs and tests (`--offline`, CI). You don't need to read this to follow the posts.
 *
 *  - fakeEmbed: one number per vocabulary word (1 if the text contains it). Real embeddings (post 03)
 *    capture meaning; this only captures a few hand-picked words, so search code runs deterministically.
 *  - fakeJudge: a "model" for llmRerank that scores a passage by how many question words it contains.
 *  - cannedModel: a "model" that always replies with the same JSON (for structured-output code paths).
 *  - fakeModel: a "model" whose JSON reply is computed from the prompt text by your function (lesson 05 uses it).
 */
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const VOCAB = ['icu', 'visit', 'children', 'refill', 'deposit', 'no-show', 'telehealth', 'discharge'];
export const fakeEmbed = (text: string) => VOCAB.map((w) => (text.toLowerCase().includes(w) ? 1 : 0.01));

const usage = {
  inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
});

export function fakeJudge(): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'word-overlap-judge',
    doGenerate: async ({ prompt }) => {
      const text = JSON.stringify(prompt).toLowerCase();
      const question = /question: (.*?)\\npassage/.exec(text)?.[1] ?? '';
      const passage = text.split('passage')[1] ?? '';
      const hits = (question.match(/[a-z]{4,}/g) ?? []).filter((w) => passage.includes(w)).length;
      return reply(JSON.stringify({ score: Math.min(10, hits * 2) }));
    },
  });
}

export function cannedModel(json: object): LanguageModel {
  return new MockLanguageModelV4({ provider: 'mock', modelId: 'canned', doGenerate: async () => reply(JSON.stringify(json)) });
}

export function fakeModel(respond: (promptText: string) => object, modelId = 'fake'): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async ({ prompt }) => reply(JSON.stringify(respond(JSON.stringify(prompt)))),
  });
}
