# Post 06 · The fallback chain

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 6 of 10 · about 25 minutes*

> The circuit breaker from the last post works: when the primary model goes down, your API stops waiting and returns an error in 0 ms. The ward nurses now see "AI unavailable" instead of a spinner. Better, but they still can't book anything.
>
> You have a second model sitting right there. It's a bit smaller, a bit less clever, and perfectly able to say "Bed 12's follow-up is booked for Thursday". Let's use it.

---

## The idea, in plain English

A **fallback chain** is an ordered list of models. Try the first. If it fails or times out, try the next. Return the first good answer, and record which model served it.

```
request ─▶ [primary] ──fail──▶ [backup] ──fail──▶ [last resort] ──fail──▶ one clear error
               │ok                 │ok                  │ok
               ▼                   ▼                    ▼
            answer             answer (servedBy: backup)  …
```

Things that make a chain work well:

- **Each attempt has its own budget.** Use a fresh `AbortSignal.timeout` per attempt, and keep the total below what the user will wait for.
- **Each model has its own circuit breaker** ([post 05](../05-circuit-breaker/README.md)), so a dead primary is skipped **instantly** after a few failures, instead of costing a timeout on every request.
- **Different failures, different choices.** A model that is *down* should fall back. A request the model *refused* for safety reasons, or a `400` caused by your own bad input, usually should not; the next model will refuse or fail too.
- **The backup should really be different.** Another provider, or another region, protects you from more outages than a second model on the same server.
- **Record who answered.** If 30% of answers come from the backup, quality may be dropping, and you want to see it in your traces (lesson 07) and evals (lesson 05).
- **When everything fails, fail with one clear error**, and let the caller show a friendly message.

The AI SDK doesn't include a fallback helper, so this is a short function you own. Gateways such as LiteLLM can also do it outside your code ([lesson 08](../../08-cloud/README.md)).

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** uses a fake down model and a fake working one. Part **B** uses a real chain: a model id that doesn't exist, then your `CHAT_MODEL`, then your `FALLBACK_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — a candidate is a model plus its breaker

```ts
interface Candidate {
  name: string;
  model: LanguageModel;
  breaker: CircuitBreaker;
}
```

```ts
const candidate = (name: string, model: LanguageModel): Candidate => ({ name, model, breaker: new CircuitBreaker(name, 2, 10_000) });
```

The `CircuitBreaker` is imported from post 05. Each candidate keeps its own.

### Step 2 — try each in order

```ts
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
```

The first success returns at once, along with `servedBy` and the list of what was skipped. Log those.

```ts
    } catch (e) {
      const why = (e as Error).name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : (e as Error).message.slice(0, 60);
      skipped.push(`${c.name}: ${why}`);
    }
```

A failure is recorded with a short reason, and the loop moves to the next model.

### Step 3 — when everything fails

```ts
  // Every model failed: ONE clear error for the caller (who should show a friendly message).
  throw new AggregateError([], `all models failed → ${skipped.join(' | ')}`);
```

One error that explains every attempt. Your API turns it into a `503` with a "try again shortly" message.

### Step 4 — the real chain

```ts
const ids = ['model-that-does-not-exist', env.chatModel, env.fallbackModel].filter((id): id is string => !!id);
const realChain = ids.map((id) => candidate(id, chatModel(id)));
```

The models come from `.env` (`CHAT_MODEL`, `FALLBACK_MODEL`). A deliberately broken id goes first so you can watch the chain work.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:06:offline   # part A only
npm run post:06           # A + B (calls your models)
# or: npx tsx 06-fallback-chain/example.ts [--offline]
```

### What you should see

- **Part A**: calls 1 and 2 are `served by backup` with `primary: …503…` in the skipped list. On call 3, `primary` is skipped with `circuit open`, without any call.
- **Part B**: on the box (`CHAT_MODEL=qwen3:0.6b`, `FALLBACK_MODEL=qwen2.5:0.5b`), the broken id failed with `Not Found` and `qwen3:0.6b` answered. By call 3 the broken id was skipped instantly because its circuit was open.
- **B2**: with a 1 ms budget every model times out, and you get one `all models failed → …` message.

## Common gotchas

- ❌ **Falling back on every error.** A `400` from your own bad request will fail on every model. Fall back on timeouts, 429 and 5xx.
- ❌ **One shared timeout for the whole chain.** The first model uses it all and the backup gets 0 ms. Budget per attempt, and cap the total.
- ❌ **A backup on the same server.** If Ollama itself is down, `FALLBACK_MODEL` on the same Ollama is down too. In production, use a different provider or region.
- ❌ **Silent quality drop.** The backup may be weaker. With the box's tiny models, the fallback model followed instructions noticeably less well. Track `servedBy`.
- ✅ Schema-check backup answers exactly like primary ones (post 02). A different model can produce different shapes.

## Try it yourself

1. Remove `FALLBACK_MODEL` from your `.env` and run B2. What changes in the error?
2. Add a total budget: stop trying new candidates if more than 10 s have passed overall.
3. Change `withFallback` so a `400` error stops the chain instead of falling back. (Hint: `APICallError.isInstance(e) && e.statusCode === 400`.)

## Key takeaways

- A fallback chain tries models **in order** and returns the first good answer.
- Give each attempt **its own timeout** and each model **its own circuit breaker**.
- Fall back on **availability** errors, not on bad requests or safety refusals.
- Record **who answered**, and fail with **one clear error** when all fail.

---

[← Previous: The circuit breaker](../05-circuit-breaker/README.md) · [📚 Series index](../README.md) · [Next: Least privilege: tool allow-lists and authorization →](../07-tool-allow-lists/README.md)
