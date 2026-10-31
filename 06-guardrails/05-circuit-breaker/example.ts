/**
 * Post 05 — The circuit breaker: stop calling a model that is down
 * (read the blog post first: 05-circuit-breaker/README.md)
 *
 *   The CircuitBreaker class below wraps every call to ONE model:
 *     closed    → calls go through; count consecutive failures
 *     open      → after `threshold` failures, refuse calls instantly for `coolDownMs`
 *     half-open → after the cool-down, let ONE probe call through; success closes it again
 *
 *   A. A fake model that is down, then recovers (no real model).
 *   B. Your Ollama server with a model id that does not exist (a real 404).
 *
 * Run:  npx tsx 05-circuit-breaker/example.ts            (A + B)
 *       npx tsx 05-circuit-breaker/example.ts --offline  (A only)
 * Post 06 imports CircuitBreaker from this file.
 */
import { APICallError, generateText, type LanguageModel } from 'ai';
import { chatModel, dump, isMain, section } from '@learn/shared';
import { failingModel, scriptedModel } from '../support/mock-models.ts';

export class CircuitBreaker {
  private failures = 0; // consecutive failures
  private openedAt = 0; // when we last opened

  constructor(
    readonly name: string,
    private readonly threshold = 3, // failures in a row before we open
    private readonly coolDownMs = 30_000, // how long to stay open before one probe
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.failures < this.threshold) return 'closed';
    return Date.now() - this.openedAt >= this.coolDownMs ? 'half-open' : 'open';
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Open = fail FAST. No network call, no waiting for a timeout.
    if (this.state === 'open') throw new Error(`circuit open for ${this.name}`);
    try {
      const result = await fn();
      this.failures = 0; // any success (including the half-open probe) closes the circuit
      return result;
    } catch (e) {
      if (++this.failures >= this.threshold) this.openedAt = Date.now(); // (re)open
      throw e;
    }
  }
}

let shownOpenError = false; // dump the breaker's own error only the first time

async function callThrough(breaker: CircuitBreaker, model: LanguageModel, label: string) {
  const t0 = performance.now();
  try {
    await breaker.run(() => generateText({ model, prompt: 'Say OK', maxRetries: 0, maxOutputTokens: 256 }));
    console.log(`${label}: ✅ ok             state=${breaker.state}`);
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    console.log(`${label}: ❌ ${(e as Error).message.slice(0, 50).padEnd(50)} ${ms} ms  state=${breaker.state}`);
    // Two very different errors reach this catch. A real failure is an APICallError with a statusCode
    // (its full shape: post 04): we log only the fields that matter. The breaker's refusal is a plain
    // Error with no statusCode and no url (no request was sent at all): dump the first one in full.
    if (APICallError.isInstance(e)) {
      console.log(`  → APICallError statusCode=${e.statusCode} isRetryable=${e.isRetryable}${e.responseBody ? ` responseBody=${e.responseBody}` : ''}`);
    } else if (!shownOpenError) {
      shownOpenError = true;
      dump(`${label.trim()}: caught error`, e);
    }
  }
}

if (isMain(import.meta.url)) {
  section('[A] A model that is down, then recovers (threshold 2, cool-down 500 ms)');
  const breaker = new CircuitBreaker('mock-model', 2, 500);
  const down = failingModel('mock-model', 503);
  for (let i = 1; i <= 4; i++) await callThrough(breaker, down, `call ${i}`); // 2 real failures, then instant refusals
  await new Promise((r) => setTimeout(r, 600)); // wait out the cool-down → half-open
  console.log(`after cool-down:                                         state=${breaker.state}`);
  await callThrough(breaker, scriptedModel({ text: 'OK' }), 'probe '); // the model is back

  if (!process.argv.includes('--offline')) {
    section('[B] Your Ollama server with a model id that does not exist');
    const real = new CircuitBreaker('model-that-does-not-exist', 2, 10_000);
    for (let i = 1; i <= 4; i++) await callThrough(real, chatModel('model-that-does-not-exist'), `call ${i}`);
  }
}
