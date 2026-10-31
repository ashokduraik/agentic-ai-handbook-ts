# Post 02 · Timeouts that really stop the work

*Series: [Lesson 09 — Deployment](../README.md) · Post 2 of 9 · about 20 minutes*

> The model is overloaded and some answers take 90 seconds. You add a 30-second timeout, and users now get a quick error. But the bill doesn't go down, and the model gets *slower*. The timed-out calls are still running in the background, every one of them.

---

## The idea, in plain English

There are two kinds of timeout:

- **Stop waiting.** `Promise.race([work, timer])` returns an error after 30 seconds, but `work` keeps going. The model call finishes, you pay for every token, and nobody reads the answer. Worse, those abandoned calls keep the model busy, so everyone else gets slower.
- **Stop the work.** Pass an **`AbortSignal`** to the call. When it fires, the AI SDK cancels the HTTP request to the model, and the provider stops generating. (Ollama stops; cloud providers stop billing for tokens not yet generated.)

`AbortSignal.timeout(ms)` gives you a signal that fires after `ms` milliseconds. `AbortSignal.any([a, b])` fires when *either* fires. That lets one signal cover both reasons to stop:

1. **Too slow**: our own time limit.
2. **The client hung up**: the nurse closed the tab. Why finish an answer nobody will see?

In a server, a timeout becomes **504 Gateway Timeout**: "the thing behind me was too slow".

---

## Let's see it in code

Open [`example.ts`](./example.ts). Offline, a fake model takes 2 seconds but stops early when its signal fires, exactly like a real HTTP call.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — one signal for both reasons

```ts
/** 1. Abort when the time is up OR when the client disconnects, whichever comes first. */
export function requestSignal(res: ServerResponse, timeoutMs: number): AbortSignal {
  const clientGone = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) clientGone.abort(new Error('client disconnected')); // closed before we answered
  });
  return AbortSignal.any([AbortSignal.timeout(timeoutMs), clientGone.signal]);
}
```

Post 06's server creates one of these per request.

### Step 2 — the trap

```ts
    const giveUp = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
    await Promise.race([generateText({ model: model(), prompt }), giveUp]).catch((e) => console.log(`  ${ms()} ms: caller gave up (${e.message})`));
```

### Step 3 — the fix

```ts
    const result = await generateText({ model: model(), prompt, abortSignal: AbortSignal.timeout(TIMEOUT_MS), maxRetries: 0 });
    console.log(`  finished in ${ms() - start} ms (the model was faster than the timeout)`);
    // Only when the model beat the timeout. Just the fields this post cares about: the full result shape
    // is in lesson 01, post 00.
    dump('generateText() result: text and usage', { text: result.text, usage: result.usage });
```

```ts
    // 2. In a server, a timeout becomes 504 Gateway Timeout; anything else stays a 500.
    console.log(`  ${ms() - start} ms: aborted → would answer ${isTimeout(e) ? 504 : 500}  (${(e as Error).name})`);
    // The error generateText threw. Notice `name: 'TimeoutError'`: that is what isTimeout() looks for.
    dump('caught error', e);
```

`dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)). The `generateText()` result is dumped here as just `text` and `usage`: the [full shape of a `generateText()` result](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned) was dumped once in lesson 01, post 00. The caught error is new, so that one is dumped whole.

`maxRetries: 0` matters here: by default the AI SDK retries failed calls, and you don't want a retry after the time is already up.

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:02:offline   # the trap and the fix, with a fake 2-second model
npm run post:02           # the fix with CHAT_MODEL, asked for an 800-word answer, 1.5 s limit
# or: npx tsx 02-timeouts-that-abort/example.ts
```

### What you should see

(Millisecond values and the port number vary from run to run.)

Offline:

```
── [A] The trap: Promise.race with a 300 ms timeout ──
  301 ms: caller gave up (timeout)
  2020 ms: …but the model call kept running and finished anyway: 900 tokens paid for, never read.

── [B] The fix: abortSignal with a 300 ms timeout ──
  301 ms: aborted → would answer 504  (TimeoutError)
▼ caught error
DOMException { name: 'TimeoutError', message: 'The operation was aborted due to timeout' }
  (hidden for readability: stack — set SHOW_RAW=1 to print everything)
  model finished? no: the call was cancelled
```

The caught error is a `DOMException` named `TimeoutError`, thrown by `AbortSignal.timeout()`. The AI SDK passes it on unchanged, so `isTimeout()` only has to check `name`. A client disconnect would show your own `Error('client disconnected')` here instead, which becomes a 500.

Live on the box (`qwen3:0.6b`), the model did not finish in time, so the same error was dumped and no `generateText() result: text and usage` was printed:

```
  1505 ms: aborted → would answer 504  (TimeoutError)
▼ caught error
DOMException { name: 'TimeoutError', message: 'The operation was aborted due to timeout' }
```

With a fast model or a higher limit, you get `finished in … ms` and the `text` and `usage` of the result instead.

## Common gotchas

- ❌ **`Promise.race` timeouts.** They hide the problem and keep paying for it.
- ❌ **Signals that don't reach every step.** A RAG request is embed → search → rerank → generate. If only `generateText` gets the signal, the timeout can overshoot by the time the other steps take. (Post 06 shows this.)
- ❌ **Retrying after a timeout** inside the same request. Set `maxRetries` with the time limit in mind.
- ❌ **One timeout for everything.** A one-line FAQ and a discharge summary need different limits.
- ✅ Streaming (`streamText`) helps users feel less wait, and takes the same `abortSignal`.

## Try it yourself

1. Remove `maxRetries: 0` from part B (offline) and see whether anything changes. Why not?
2. Live: raise the limit until the answer finishes. How long does an 800-word answer take on your model?
3. Write a tiny server that uses `requestSignal`, call it with `curl --max-time 1`, and log the abort reason.

## Key takeaways

- A timeout must **cancel** the work: pass an `AbortSignal` (`AbortSignal.timeout(ms)`) to the model call.
- Combine reasons with `AbortSignal.any`: too slow **or** client gone.
- A timeout is a **504**. Don't retry after the time is up.

---

[← Previous: Validate at the edge](../01-validate-at-the-edge/README.md) · [📚 Series index](../README.md) · [Next: Load shedding →](../03-load-shedding/README.md)
