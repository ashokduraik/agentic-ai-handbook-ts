# Post 05 · The circuit breaker

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 5 of 10 · about 25 minutes*

> The model provider has an outage. Each of your 200 requests a second waits 30 s for a timeout, then retries twice. Your service is now slow *and* is hammering a provider that is already struggling. When it recovers, the backlog knocks it over again.
>
> If something is clearly down, the kindest and fastest thing is to stop calling it for a while. That is a circuit breaker.

---

## The idea, in plain English

The name comes from the electrical breaker in your house: when something goes wrong, it trips and cuts the circuit, so the problem doesn't spread.

A software circuit breaker sits in front of one dependency (here, one model) and has three states:

```
          failures reach threshold
 CLOSED ───────────────────────────────▶ OPEN
   ▲  calls go through                    │  calls are refused instantly
   │                                      │  (no network, no waiting)
   │ probe succeeds                       │ cool-down passes
   │                                      ▼
   └──────────────────────────────── HALF-OPEN
               probe fails → back to OPEN   one test call is allowed through
```

- **Closed** (normal): calls go through. Count failures in a row.
- **Open**: after N failures, refuse every call **instantly** for a cool-down period. Your users get a fast error (or a fallback, [next post](../06-fallback-chain/README.md)) instead of a 30 s wait.
- **Half-open**: after the cool-down, let **one** probe call through. If it works, close the circuit. If it fails, open again.

Two numbers to choose:

- **Threshold**: how many failures in a row mean "it's down"? Too low and one blip trips it; too high and you wait too long. 3–5 is common.
- **Cool-down**: how long to stay away. Seconds to a minute, depending on how fast your provider usually recovers.

In production you'd use a library such as `opossum`, and keep one breaker **per model**, shared by all requests in the process. Writing a small one yourself is the best way to understand what those libraries do.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It exports the `CircuitBreaker` class (post 06 reuses it). Part **A** uses a fake model that is down and then recovers. Part **B** uses a model id that doesn't exist on your Ollama server, which gives a real error.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the state

```ts
export class CircuitBreaker {
  private failures = 0; // consecutive failures
  private openedAt = 0; // when we last opened
```

```ts
  get state(): 'closed' | 'open' | 'half-open' {
    if (this.failures < this.threshold) return 'closed';
    return Date.now() - this.openedAt >= this.coolDownMs ? 'half-open' : 'open';
  }
```

The state isn't stored; it is **worked out** from two numbers. Fewer failures than the threshold means closed. Otherwise it depends on whether the cool-down has passed.

### Step 2 — wrapping a call

```ts
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
```

`run` takes a function (not a promise), so the breaker can decide **not to call it at all**. A success resets the count. A failure that reaches the threshold records when the circuit opened. A failed half-open probe pushes the count past the threshold again, so it re-opens.

### Step 3 — using it

```ts
    await breaker.run(() => generateText({ model, prompt: 'Say OK', maxRetries: 0, maxOutputTokens: 256 }));
```

Notice `maxRetries: 0`. If the SDK retried inside the breaker, one "failure" would really be three slow attempts. Let the breaker see every failure.

```ts
  const breaker = new CircuitBreaker('mock-model', 2, 500);
  const down = failingModel('mock-model', 503);
  for (let i = 1; i <= 4; i++) await callThrough(breaker, down, `call ${i}`); // 2 real failures, then instant refusals
```

A threshold of 2 and a 500 ms cool-down, so the demo is quick. After the cool-down, a working model is used as the probe.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:05:offline   # part A only
npm run post:05           # A + B (uses your Ollama server)
# or: npx tsx 05-circuit-breaker/example.ts [--offline]
```

### What you should see

- **Part A**: calls 1–2 fail with the 503 and the state becomes `open`. Calls 3–4 fail with `circuit open for mock-model` in about **0 ms**. After the cool-down the state is `half-open`, and the probe succeeds and closes it.
- **Part B**: calls 1–2 fail with Ollama's `Not Found` error, then calls 3–4 are refused instantly by the open circuit. (With Azure or Bedrock you'd see their own "deployment/model not found" messages; those providers are untested here.)

## Common gotchas

- ❌ **A new breaker per request.** It never sees more than one failure. Keep one per model, for the life of the process.
- ❌ **Counting errors that aren't the model's fault.** A `400` from a bad prompt says nothing about the provider's health. In production, only count timeouts, 429s and 5xx.
- ❌ **Letting SDK retries hide failures** from the breaker (use `maxRetries: 0` inside it, or count carefully).
- ❌ **Several server instances** each have their own breaker, so each one must learn about the outage separately. That's usually fine; shared state (Redis) is rarely worth it.
- ✅ An open circuit should lead somewhere useful: a fallback model, a cached answer, or a friendly "try again shortly".

## Try it yourself

1. Change the threshold to 3 in Part A. How many slow failures happen before calls are refused?
2. Make the probe fail too (use `down` instead of `scriptedModel`). Check that the state goes back to `open`.
3. Change `run` so it only counts errors where `APICallError.isInstance(e) && e.isRetryable`, or `e.name === 'TimeoutError'`. Why is that better?

## Key takeaways

- A circuit breaker **stops calling a dependency that is clearly down**, and fails fast instead.
- Three states: **closed → open** (after N failures) **→ half-open** (after a cool-down) **→ closed** (if a probe works).
- Keep **one breaker per model** for the life of the process.
- It works with timeouts (post 04) and leads naturally to fallbacks (post 06).

---

[← Previous: Timeouts and retries](../04-timeouts-and-retries/README.md) · [📚 Series index](../README.md) · [Next: The fallback chain →](../06-fallback-chain/README.md)
