/**
 * Post 04 — Timeouts and retries: a slow or flaky model must not hang your API
 * (read the blog post first: 04-timeouts-and-retries/README.md)
 *
 *   A. RETRIES: a fake model fails twice with HTTP 503, then answers. The AI SDK retries it for
 *      you (maxRetries, exponential backoff). With maxRetries: 0 the first failure reaches you.
 *   B. TIMEOUTS: a fake model takes 3 s; we give it 300 ms. The call is ABORTED, not just ignored.
 *   C. The same timeout against your CHAT_MODEL: 1 ms (always too short) and 120 s (enough).
 *
 * Run:  npx tsx 04-timeouts-and-retries/example.ts            (A + B + C)
 *       npx tsx 04-timeouts-and-retries/example.ts --offline  (A + B)
 */
import { generateText } from 'ai';
import { chatModel, section, stripThinking } from '@learn/shared';
import { flakyModel, slowModel } from '../support/mock-models.ts';

// ---------------------------------------------------------------------------
// Part A: retries
// ---------------------------------------------------------------------------
section('[A1] maxRetries: 2 (the default) — the SDK hides two 503s from you');
const flaky = flakyModel(2); // fails on calls 1 and 2, succeeds on call 3
let t0 = performance.now();
const { text } = await generateText({ model: flaky.model, prompt: 'Say OK', maxRetries: 2 });
console.log(`answer "${text}" after ${flaky.calls.count} calls in ${Math.round(performance.now() - t0)} ms (backoff waits ~2 s, then ~4 s)`);

section('[A2] maxRetries: 0 — the first 503 reaches your code');
const flaky2 = flakyModel(2);
try {
  await generateText({ model: flaky2.model, prompt: 'Say OK', maxRetries: 0 });
} catch (e) {
  console.log(`caught after ${flaky2.calls.count} call: ${(e as Error).message}`);
}

// ---------------------------------------------------------------------------
// Part B: timeouts
// ---------------------------------------------------------------------------
section('[B] A 3 s model with a 300 ms budget');
t0 = performance.now();
try {
  await generateText({
    model: slowModel(3000),
    prompt: 'Summarise the discharge letter.',
    abortSignal: AbortSignal.timeout(300), // the budget for THIS attempt
    maxRetries: 0,
  });
} catch (e) {
  // AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
  console.log(`${(e as Error).name} after ${Math.round(performance.now() - t0)} ms — the HTTP call was cancelled`);
}

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part C: the same with your real model
// ---------------------------------------------------------------------------
async function askWithBudget(ms: number) {
  t0 = performance.now();
  try {
    const r = await generateText({
      model: chatModel(),
      prompt: 'In one short sentence: what are hospital visiting hours for?',
      abortSignal: AbortSignal.timeout(ms),
      maxOutputTokens: 512,
    });
    console.log(`budget ${ms} ms → answered in ${Math.round(performance.now() - t0)} ms: ${stripThinking(r.text).slice(0, 100)}`);
  } catch (e) {
    console.log(`budget ${ms} ms → ${(e as Error).name} after ${Math.round(performance.now() - t0)} ms`);
  }
}
section('[C] Your CHAT_MODEL with a 1 ms budget, then a 120 s budget');
await askWithBudget(1);
await askWithBudget(120_000);
