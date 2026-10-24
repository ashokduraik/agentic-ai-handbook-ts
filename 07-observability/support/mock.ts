/**
 * Fake models so every example has an --offline part that needs no Ollama.
 * The capstone imports these as `@learn/07-observability/mock`.
 */
import type { EmbeddingModel, LanguageModel } from 'ai';
import { MockEmbeddingModelV4, MockLanguageModelV4, mockValues } from 'ai/test';

type Step = { text: string } | { toolName: string; input: object };

const usageOf = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

/** Plays the given steps in order: text answers or tool calls. Reports 42 input / 7 output tokens per step. */
export function scriptedModel(...steps: Step[]): LanguageModel {
  const next = mockValues(
    ...steps.map((s, i) => ({
      content:
        'text' in s
          ? [{ type: 'text' as const, text: s.text }]
          : [{ type: 'tool-call' as const, toolCallId: `call-${i}`, toolName: s.toolName, input: JSON.stringify(s.input) }],
      finishReason: { unified: 'text' in s ? ('stop' as const) : ('tool-calls' as const), raw: undefined },
      usage: usageOf(42, 7),
      warnings: [],
    })),
  );
  return new MockLanguageModelV4({ provider: 'mock', modelId: 'scripted', doGenerate: async () => next() });
}

/** A model whose provider call fails, like an unknown model id or a 5xx. */
export function failingModel(message = 'model "this-model-does-not-exist" not found'): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'broken',
    doGenerate: async () => {
      throw Object.assign(new Error(message), { name: 'ModelNotFoundError' });
    },
  });
}

/**
 * A fake model with a realistic "personality": it takes about `latencyMs` (± 50%) and uses
 * about `outputTokens` (± 50%). Used to produce latency and token numbers worth summarising.
 */
export function fakeModel(modelId: string, latencyMs: number, outputTokens: number): LanguageModel {
  let seed = modelId.length * 7919; // deterministic pseudo-random, so the demo output is stable
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async ({ prompt }) => {
      await new Promise((r) => setTimeout(r, latencyMs * (0.5 + rand())));
      const out = Math.round(outputTokens * (0.5 + rand()));
      return {
        content: [{ type: 'text', text: `(${modelId} answer, ${out} tokens)` }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: usageOf(Math.round(JSON.stringify(prompt).length / 4), out), // ~4 characters per token
        warnings: [],
      };
    },
  });
}

/** A toy embedding: counts a few clinic words. Good enough to rank 4 tiny documents offline. */
export function wordEmbeddingModel(): EmbeddingModel {
  const vocab = ['visit', 'hour', 'deposit', 'no-show', 'park', 'pharmacy', 'fee', 'open'];
  return new MockEmbeddingModelV4({
    provider: 'mock',
    modelId: 'word-count',
    maxEmbeddingsPerCall: 100,
    doEmbed: async ({ values }) => ({
      embeddings: values.map((v) => vocab.map((w) => v.toLowerCase().split(w).length - 1)),
      warnings: [],
    }),
  });
}
