# Post 04 · Timeouts and retries

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 4 of 10 · about 25 minutes*

> Monday 8 am, the busiest hour of the week. The model provider slows down. Your appointment API has no timeout, so every request waits... and waits. Node's connection pool fills up, the load balancer marks your service unhealthy, and now even the pages that don't use AI are down.
>
> One slow dependency took down everything. This post adds the two simplest defences: a time budget for every call, and retries for errors that are worth retrying.

---

## The idea, in plain English

### Every call needs a budget

A model call is a network call to something you don't control. It can take 300 ms or 3 minutes. If you don't set a limit, your users and your servers wait as long as the slowest response.

A **timeout** says "if this hasn't finished in X ms, give up". Two details matter:

- **Actually cancel the work.** Giving up on the *promise* while the HTTP request keeps running wastes tokens and connections. In Node you use an `AbortSignal`; the AI SDK passes it down to `fetch`, which closes the connection.
- **Pick the number from data.** A local 0.6B model and a large hosted model have very different normal latencies. Measure (lesson 07), then set the budget a bit above your normal slow case.

`AbortSignal.timeout(ms)` creates a signal that fires by itself after `ms` milliseconds. Pass it as `abortSignal`.

### Retries: only for errors that might go away

Some failures are temporary: `429 Too Many Requests`, `503 Service Unavailable`, a dropped connection. Trying again a moment later often works. Others are permanent: `401` (bad key), `404` (wrong model name), `400` (bad request). Retrying those just wastes time.

The AI SDK already does this for you. `maxRetries` (default **2**) retries only errors the provider marks as retryable, with **exponential backoff**: wait about 2 s, then about 4 s, so a struggling provider gets breathing room.

Retries and timeouts interact: three attempts with backoff can take far longer than one. Decide which budget you mean, per attempt or for the whole request. The next two posts build on this.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Parts **A** and **B** use fake models from `support/mock-models.ts`, so you can see the exact behaviour. Part **C** uses your `CHAT_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — retries you get for free

```ts
const flaky = flakyModel(2); // fails on calls 1 and 2, succeeds on call 3
let t0 = performance.now();
const retried = await generateText({ model: flaky.model, prompt: 'Say OK', maxRetries: 2 });
```

The fake model throws a retryable `503` twice, then answers. Your code sees only the answer. The timing in the output shows the backoff waits.

```ts
const perf = retried.steps[0]!.performance;
console.log(`finishReason: ${retried.finishReason}  steps: ${retried.steps.length}  responseTimeMs: ${Math.round(perf.responseTimeMs)}  outputTokensPerSecond: ${perf.effectiveOutputTokensPerSecond.toFixed(2)}`);
```

We don't print the full result again (all its fields are in [lesson 01, post 00](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)). Look for the two failures in what we do log: they are not there. One step, `finishReason: 'stop'`. The only hint is the step's `performance.responseTimeMs`, about 6000 ms for a model that answers instantly: it includes the backoff waits.

### Step 2 — turning retries off

```ts
  await generateText({ model: flaky2.model, prompt: 'Say OK', maxRetries: 0 });
```

```ts
  dump('caught error (maxRetries: 0)', e);
```

With `maxRetries: 0` the first `503` reaches your `catch`. The dump shows the error as fields: an `APICallError` with `statusCode: 503` and `isRetryable: true` (the SDK's own retry loop reads exactly this flag), plus the `url` it called. `dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) hides the stack trace and the request body it sent (`requestBodyValues`). You'll want this when **you** handle failure yourself, for example by switching to another model ([post 06](../06-fallback-chain/README.md)) rather than waiting 6 s on a model that is down.

### Step 3 — a timeout that cancels

```ts
  await generateText({
    model: slowModel(3000),
    prompt: 'Summarise the discharge letter.',
    abortSignal: AbortSignal.timeout(300), // the budget for THIS attempt
    maxRetries: 0,
  });
```

The fake model would take 3 s. After 300 ms the signal fires, the call rejects, and the fake model stops (it listens to the signal like a real `fetch` does).

```ts
  // AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
  console.log(`${(e as Error).name} after ${Math.round(performance.now() - t0)} ms — the HTTP call was cancelled`);
```

Check `e.name === 'TimeoutError'` to tell a timeout apart from other failures, for example to return `504` instead of `500` from your API.

```ts
  dump('caught error (timeout)', e);
```

Compare it with the 503 above: a `DOMException` with only `name` and `message`. No `statusCode`, no `isRetryable`, because no server ever answered.

### Step 4 — the real model

```ts
    const r = await generateText({
      model: chatModel(),
      prompt: 'In one short sentence: what are hospital visiting hours for?',
      abortSignal: AbortSignal.timeout(ms),
      maxOutputTokens: 512,
    });
```

Part C calls this with 1 ms (always too short) and 120 s (plenty for a small local model).

```ts
    console.log(`  outputTokens: ${r.usage.outputTokens}  responseTimeMs: ${Math.round(r.steps.at(-1)!.performance.responseTimeMs)}`);
```

For the call that made it, look at `usage.outputTokens` next to the step's `performance.responseTimeMs`: on a real model the time grows with the tokens it writes, so a time budget and `maxOutputTokens` belong together.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:04:offline   # parts A + B (about 7 s: the retry backoff is real)
npm run post:04           # A + B + C (calls your CHAT_MODEL)
# or: npx tsx 04-timeouts-and-retries/example.ts [--offline]
```

### What you should see

- **A1**: `answer "OK" after 3 calls in ~6000 ms`. Two failures hidden by the SDK, at the cost of 6 s.
- **A2**: `caught after 1 call: …503…`.
- **B**: `TimeoutError after ~300 ms`.
- **C**: `budget 1 ms → TimeoutError`, then `budget 120000 ms → answered in …ms`. On the box's small model the answer took well under a second, and the model added made-up visiting hours. A timeout says nothing about correctness.

With `qwen3:0.6b` (timings and the answer differ between runs):

```
── [A1] maxRetries: 2 (the default) — the SDK hides two 503s from you ──
finishReason: stop  steps: 1  responseTimeMs: 6007  outputTokensPerSecond: 1.33
answer "OK" after 3 calls in 6027 ms (backoff waits ~2 s, then ~4 s)

── [A2] maxRetries: 0 — the first 503 reaches your code ──
caught after 1 call: HTTP 503 overloaded
▼ caught error (maxRetries: 0)
APICallError {
  name: 'AI_APICallError',
  message: 'HTTP 503 overloaded',
  url: 'http://mock/api/chat',
  requestBodyValues: [hidden requestBodyValues: 0 keys],
  statusCode: 503,
  isRetryable: true
}
  (hidden for readability: requestBodyValues, stack — set SHOW_RAW=1 to print everything)

── [B] A 3 s model with a 300 ms budget ──
TimeoutError after 302 ms — the HTTP call was cancelled
▼ caught error (timeout)
DOMException { name: 'TimeoutError', message: 'The operation was aborted due to timeout' }
  (hidden for readability: stack — set SHOW_RAW=1 to print everything)

── [C] Your CHAT_MODEL with a 1 ms budget, then a 120 s budget ──
budget 1 ms → TimeoutError after 14 ms
budget 120000 ms → answered in 629 ms: Hospital visiting hours are typically scheduled in the morning and evening, with specific times depe
  outputTokens: 23  responseTimeMs: 628
```

`outputTokensPerSecond: 1.33` in A1 is the retry cost in one number: a model that answers instantly looks slow, because the step's time includes the 6 s of backoff. In C, `outputTokens: 23` in about 0.6 s is the real speed of a small local model. (In this run the answer happened to have no made-up hours.) The mock's `requestBodyValues` is empty (`0 keys`); a real provider's would hold the whole request.

## Common gotchas

- ❌ **No timeout at all.** The default is to wait as long as the provider likes.
- ❌ **`Promise.race` with a timer but no abort.** You stop waiting, but the request keeps running and billing.
- ❌ **Retrying 400/401/404.** These won't fix themselves. The SDK already skips them; don't add your own loop that doesn't.
- ❌ **Forgetting retries multiply latency.** A 30 s timeout with `maxRetries: 2` can take well over 90 s.
- ❌ **Small local models can be slow on first call** (loading into memory). Warm them up, or budget the first call separately.
- ✅ Give every call an `abortSignal`, and decide deliberately between SDK retries and your own fallback.

## Try it yourself

1. Change A1 to `flakyModel(3)`. What happens with `maxRetries: 2`?
2. In Part C, find the smallest budget that still works reliably for your model. Run it five times.
3. Use `AbortSignal.any([AbortSignal.timeout(5000), req.signal])` (pseudo-code) to also cancel when the user closes the browser tab. Where would `req.signal` come from in an Express or Fastify handler?

## Key takeaways

- Every model call needs a **time budget**, passed as an `abortSignal` so the work is really cancelled.
- `maxRetries` (default 2) retries **only retryable** errors, with exponential backoff.
- Retries add latency. Turn them off (`maxRetries: 0`) when you'd rather fall back quickly.
- A timeout's `name` is `TimeoutError`; map it to a clear response for your users.

---

[← Previous: Check the model's tool arguments](../03-tool-argument-checks/README.md) · [📚 Series index](../README.md) · [Next: The circuit breaker →](../05-circuit-breaker/README.md)
