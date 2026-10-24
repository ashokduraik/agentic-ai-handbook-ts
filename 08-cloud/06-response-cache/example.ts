/**
 * Post 06 — A response cache: don't pay twice for the same answer
 * (read the blog post first: 06-response-cache/README.md)
 *
 *   A. createCache(): an exact-match cache as middleware, with a time-to-live.
 *   B. The same question twice → the second is a hit (fast and free).
 *   C. Same words, different tools or settings → a MISS, because the key includes them.
 *
 * Post 08 imports createCache from this file.
 *
 * Run:  npx tsx 06-response-cache/example.ts            (CHAT_MODEL)
 *       npx tsx 06-response-cache/example.ts --offline  (a fake model)
 */
import { generateText, tool, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { chatModel, isMain, section } from '@learn/shared';
import { fakeModel, type ModelObject } from '../support/fakes.ts';

export function createCache({ ttlMs = 10 * 60_000 } = {}) {
  const entries = new Map<string, { at: number; result: unknown }>();
  const stats = { hits: 0, misses: 0 };

  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params, model }) => {
      // 1. The key is EVERYTHING that can change the answer: model, prompt, tools, and settings.
      //    Leave out tools and a call with different tools could get an answer that ignores them.
      const { prompt, tools, toolChoice, temperature, maxOutputTokens, responseFormat } = params;
      const key = createHash('sha256')
        .update(JSON.stringify([model.provider, model.modelId, prompt, tools ?? [], toolChoice, temperature, maxOutputTokens, responseFormat]))
        .digest('hex');

      // 2. A hit that is still fresh: return the stored result without calling the model.
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) {
        stats.hits++;
        return hit.result as Awaited<ReturnType<typeof doGenerate>>;
      }

      // 3. A miss: call the model and remember the result.
      stats.misses++;
      const result = await doGenerate();
      entries.set(key, { at: Date.now(), result });
      return result;
    },
  };
  return { middleware, stats };
}

// ---- the demo (skipped when another file imports createCache) ---------------------------------
if (isMain(import.meta.url)) {
  const offline = process.argv.includes('--offline');
  const cache = createCache({ ttlMs: 60_000 });
  const model = wrapLanguageModel({
    model: offline ? fakeModel('mock-model') : (chatModel() as ModelObject),
    middleware: cache.middleware,
  });

  const timed = async (label: string, options: Partial<Parameters<typeof generateText>[0]>) => {
    const t0 = performance.now();
    await generateText({ model, prompt: 'What are the visiting hours on the cardiology ward?', maxOutputTokens: 300, ...options } as Parameters<typeof generateText>[0]);
    console.log(`  ${label.padEnd(34)} ${String(Math.round(performance.now() - t0)).padStart(5)} ms   hits=${cache.stats.hits} misses=${cache.stats.misses}`);
  };

  section('[B] The same question twice');
  await timed('first ask', {});
  await timed('same question again', {});

  section('[C] Same words, but something that changes the answer');
  const lookupHours = tool({
    description: 'Look up the official visiting hours for a ward',
    inputSchema: z.object({ ward: z.string() }),
    execute: async () => ({ hours: '10:00–12:00 and 16:00–20:00' }),
  });
  await timed('with a lookup tool', { tools: { lookupHours }, stopWhen: () => true }); // one step is enough for the demo
  await timed('with temperature 0.9', { temperature: 0.9 });

  if (offline && (cache.stats.hits !== 1 || cache.stats.misses !== 3)) throw new Error('expected 1 hit and 3 misses');
}
