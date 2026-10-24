/**
 * Post 02 — Timeouts that really stop the work
 * (read the blog post first: 02-timeouts-that-abort/README.md)
 *
 *   A. The trap: Promise.race gives up waiting, but the model call keeps running (and costing).
 *   B. The fix: pass an AbortSignal to generateText, so the call itself is cancelled.
 *   C. requestSignal(): one signal for "too slow" OR "the client hung up" (used by post 06's server).
 *
 * Post 06's service imports requestSignal and isTimeout from this file.
 *
 * Run:  npx tsx 02-timeouts-that-abort/example.ts            (CHAT_MODEL, asked for a long answer)
 *       npx tsx 02-timeouts-that-abort/example.ts --offline  (a fake model that takes 2 s)
 */
import type { ServerResponse } from 'node:http';
import { generateText } from 'ai';
import { chatModel, isMain, section } from '@learn/shared';

/** 1. Abort when the time is up OR when the client disconnects, whichever comes first. */
export function requestSignal(res: ServerResponse, timeoutMs: number): AbortSignal {
  const clientGone = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) clientGone.abort(new Error('client disconnected')); // closed before we answered
  });
  return AbortSignal.any([AbortSignal.timeout(timeoutMs), clientGone.signal]);
}

/** AbortSignal.timeout() aborts with a DOMException named "TimeoutError". */
export const isTimeout = (e: unknown) => (e as Error)?.name === 'TimeoutError' || (e as { cause?: Error })?.cause?.name === 'TimeoutError';

// ---- the demo (skipped when another file imports from here) -----------------------------------
if (isMain(import.meta.url)) {
  const { MockLanguageModelV4 } = await import('ai/test'); // test helpers: loaded only for the demo, never in the server
  const offline = process.argv.includes('--offline');
  const TIMEOUT_MS = offline ? 300 : 1500;
  let modelFinishedAt: number | undefined;
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);

  // A fake model that takes 2 s, but stops early if it's told to (like a real HTTP call would).
  const slowModel = () =>
    new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 2000);
          abortSignal?.addEventListener('abort', () => (clearTimeout(timer), reject(abortSignal.reason)));
        });
        modelFinishedAt = ms();
        return {
          content: [{ type: 'text', text: 'A very long answer…' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 900, text: 900, reasoning: undefined } },
          warnings: [],
        };
      },
    });
  const model = () => (offline ? slowModel() : chatModel());
  const prompt = 'Write a detailed, 800-word guide for patients preparing for knee surgery.';

  if (offline) {
    section(`[A] The trap: Promise.race with a ${TIMEOUT_MS} ms timeout`);
    const giveUp = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
    await Promise.race([generateText({ model: model(), prompt }), giveUp]).catch((e) => console.log(`  ${ms()} ms: caller gave up (${e.message})`));
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  ${modelFinishedAt} ms: …but the model call kept running and finished anyway: 900 tokens paid for, never read.`);
  }

  section(`[B] The fix: abortSignal with a ${TIMEOUT_MS} ms timeout`);
  modelFinishedAt = undefined;
  const start = ms();
  try {
    await generateText({ model: model(), prompt, abortSignal: AbortSignal.timeout(TIMEOUT_MS), maxRetries: 0 });
    console.log(`  finished in ${ms() - start} ms (the model was faster than the timeout)`);
  } catch (e) {
    // 2. In a server, a timeout becomes 504 Gateway Timeout; anything else stays a 500.
    console.log(`  ${ms() - start} ms: aborted → would answer ${isTimeout(e) ? 504 : 500}  (${(e as Error).name})`);
  }
  if (offline) {
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`  model finished? ${modelFinishedAt === undefined ? 'no: the call was cancelled' : 'yes'}`);
    if (modelFinishedAt !== undefined) throw new Error('expected the model call to be cancelled');
  }
}
