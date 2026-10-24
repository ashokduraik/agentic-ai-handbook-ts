/**
 * Fake models so the examples in this lesson can run with NO real model (`--offline`, CI).
 * You don't need to read this file to follow the posts. Each helper returns a normal
 * AI SDK `LanguageModel`, so the code under test cannot tell it is not talking to Ollama.
 */
import { APICallError, type LanguageModel } from 'ai';
import { MockLanguageModelV4, mockValues } from 'ai/test';

const usage = {
  inputTokens: { total: 20, noCache: 20, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 8, text: 8, reasoning: undefined },
};

/** One scripted reply: plain text, or a request to call a tool. */
export type Step = { text: string } | { toolName: string; input: object };

/** A model that replies with these steps, in order (one per model call). */
export function scriptedModel(...steps: Step[]): LanguageModel {
  const next = mockValues(
    ...steps.map((s, i) => ({
      content:
        'text' in s
          ? [{ type: 'text' as const, text: s.text }]
          : [{ type: 'tool-call' as const, toolCallId: `call-${i}`, toolName: s.toolName, input: JSON.stringify(s.input) }],
      finishReason: { unified: 'text' in s ? ('stop' as const) : ('tool-calls' as const), raw: undefined },
      usage,
      warnings: [],
    })),
  );
  return new MockLanguageModelV4({ provider: 'mock', modelId: 'scripted', doGenerate: async () => next() });
}

/** A model that is DOWN: every call fails like an HTTP 503 (retryable) or 404 (not retryable). */
export function failingModel(modelId = 'broken-model', statusCode = 503): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => {
      throw new APICallError({
        message: `${modelId}: HTTP ${statusCode}`,
        url: 'http://mock/api/chat',
        requestBodyValues: {},
        statusCode,
        isRetryable: statusCode >= 500 || statusCode === 429,
      });
    },
  });
}

/** A model that fails `failures` times with a 503, then answers. Counts its calls in `calls.count`. */
export function flakyModel(failures: number, text = 'OK'): { model: LanguageModel; calls: { count: number } } {
  const calls = { count: 0 };
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'flaky-model',
    doGenerate: async () => {
      calls.count++;
      if (calls.count <= failures) {
        throw new APICallError({ message: 'HTTP 503 overloaded', url: 'http://mock/api/chat', requestBodyValues: {}, statusCode: 503, isRetryable: true });
      }
      return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] };
    },
  });
  return { model, calls };
}

/** A model that takes `ms` to answer, and stops early if the caller aborts (like a real HTTP call). */
export function slowModel(ms: number, text = 'finally, an answer'): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'slow-model',
    doGenerate: async ({ abortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(abortSignal.reason);
        });
      });
      return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] };
    },
  });
}
