/**
 * Fakes so every example has an --offline part that needs no model and no cloud account.
 * You don't need to read this file to follow the posts.
 */
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

// `LanguageModel` also allows a plain string id; middleware needs a real model object.
export type ModelObject = Exclude<LanguageModel, string>;

/** A model that answers instantly with "(modelId) …" and reports 30 input / 9 output tokens. */
export function fakeModel(modelId: string, answer = 'Please arrive 15 minutes early.'): ModelObject {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => ({
      content: [{ type: 'text', text: `(${modelId}) ${answer}` }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 30, noCache: 30, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 9, text: 9, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

/** A model that always fails with HTTP 429 (rate limited), like a cloud deployment over quota. */
export function rateLimitedModel(modelId: string): ModelObject {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => {
      throw Object.assign(new Error(`429 Too Many Requests (${modelId})`), { statusCode: 429 });
    },
  });
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * A `fetch` that records the HTTP request a provider WOULD send, then answers 400 so the call
 * stops there. Lets you see exactly what goes to Azure or Bedrock without an account.
 */
export function captureFetch() {
  const requests: CapturedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    requests.push({
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers),
      body: JSON.parse((await req.text()) || '{}'),
    });
    return new Response(JSON.stringify({ error: { message: 'captured by captureFetch (no real call made)' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, requests };
}

/** Show a secret's first characters only. */
export const mask = (v = '') => (v.length > 12 ? `${v.slice(0, 12)}…` : '***');
