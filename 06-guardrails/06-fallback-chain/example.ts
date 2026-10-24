/**
 * Post 06 — The fallback chain: when one model fails, try the next
 * (read the blog post first: 06-fallback-chain/README.md)
 *
 *   withFallback() tries each model in order. Every attempt gets its own timeout and goes through
 *   that model's circuit breaker (from post 05), so a dead model is skipped instantly next time.
 *
 *   A. Fake chain: a model that is down → a model that works (no real model).
 *   B. Real chain: a broken model id → CHAT_MODEL → FALLBACK_MODEL (if set in .env).
 *
 * Run:  npx tsx 06-fallback-chain/example.ts            (A + B)
 *       npx tsx 06-fallback-chain/example.ts --offline  (A only)
 */
import { generateText, type LanguageModel } from 'ai';
import { chatModel, env, section, stripThinking } from '@learn/shared';
import { CircuitBreaker } from '../05-circuit-breaker/example.ts';
import { failingModel, scriptedModel } from '../support/mock-models.ts';

interface Candidate {
  name: string;
  model: LanguageModel;
  breaker: CircuitBreaker;
}

/** Try each candidate in order; return the first answer plus a record of what was skipped. */
async function withFallback(candidates: Candidate[], prompt: string, timeoutMs: number) {
  const skipped: string[] = [];
  for (const c of candidates) {
    try {
      const { text } = await c.breaker.run(() =>
        generateText({
          model: c.model,
          prompt,
          maxRetries: 0, // retries are a separate decision (post 04); 0 makes each failure visible here
          abortSignal: AbortSignal.timeout(timeoutMs), // a fresh budget per attempt
          maxOutputTokens: 256,
        }),
      );
      return { text: stripThinking(text), servedBy: c.name, skipped };
    } catch (e) {
      const why = (e as Error).name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : (e as Error).message.slice(0, 60);
      skipped.push(`${c.name}: ${why}`);
    }
  }
  // Every model failed: ONE clear error for the caller (who should show a friendly message).
  throw new AggregateError([], `all models failed → ${skipped.join(' | ')}`);
}

const candidate = (name: string, model: LanguageModel): Candidate => ({ name, model, breaker: new CircuitBreaker(name, 2, 10_000) });

section('[A] Fake chain: primary is down → backup answers');
const fakeChain = [candidate('primary', failingModel('primary', 503)), candidate('backup', scriptedModel({ text: 'OK' }, { text: 'OK' }, { text: 'OK' }))];
for (let i = 1; i <= 3; i++) {
  const r = await withFallback(fakeChain, 'Say OK', 5_000);
  console.log(`call ${i}: served by ${r.servedBy}; skipped: ${JSON.stringify(r.skipped)}`);
}
console.log('Call 3 skipped "primary" instantly: its breaker was open after 2 failures.');

if (process.argv.includes('--offline')) process.exit(0);

section('[B] Real chain: broken id → CHAT_MODEL → FALLBACK_MODEL');
const ids = ['model-that-does-not-exist', env.chatModel, env.fallbackModel].filter((id): id is string => !!id);
const realChain = ids.map((id) => candidate(id, chatModel(id)));
for (let i = 1; i <= 3; i++) {
  const r = await withFallback(realChain, 'Reply with just the word OK.', 120_000);
  console.log(`call ${i}: served by ${r.servedBy}; skipped: ${JSON.stringify(r.skipped)}`);
}

section('[B2] Every model gets a 1 ms budget → one clear error');
await withFallback(realChain, 'Write a long essay about hospitals.', 1).catch((e: Error) => console.log(e.message));
