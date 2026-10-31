# Post 06 · A response cache: don't pay twice for the same answer

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 6 of 8 · about 20 minutes*

> "What are the visiting hours?" is asked 900 times a day. Each time you pay for the tokens and the patient waits five seconds for the same sentence. Meanwhile your eval suite re-asks the same 200 questions on every commit.

---

## The idea, in plain English

A **response cache** remembers answers. Before calling the model, compute a **key** from the request; if you've seen that key recently, return the stored answer. A hit costs nothing and takes a millisecond.

This post builds an **exact-match** cache: the key is a hash of the request. Two things decide whether that's safe.

### What goes into the key

**Everything that can change the answer.** Not just the prompt:

- the **model** (a different model gives a different answer)
- the **prompt** (all messages, including instructions)
- the **tools** and tool choice. Same question, but now the model has a `lookupHours` tool: the right answer is "call the tool", not the cached text from when it had no tools. Leave tools out of the key, and you serve that stale answer.
- **settings** that change output: temperature, output limit, response format (for structured output).

### When caching is wrong

- **Personal data.** "What's *my* next appointment?" must not be served from someone else's cache entry. Only cache when the prompt fully determines the answer, and don't keep PHI in a shared cache.
- **Answers that change.** Set a **time-to-live** (TTL) so policy changes show up.
- **Variety on purpose.** At high temperature you *want* different answers.

A smarter **semantic cache** (match "visiting times?" with "when can I visit?" by embedding similarity) saves more but can return wrong answers for questions that look alike. Start with exact match.

---

## Let's see it in code

Open [`example.ts`](./example.ts). `createCache()` returns a middleware (post 05) and some stats. Post 08 reuses it.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the key

```ts
      // 1. The key is EVERYTHING that can change the answer: model, prompt, tools, and settings.
      //    Leave out tools and a call with different tools could get an answer that ignores them.
      const { prompt, tools, toolChoice, temperature, maxOutputTokens, responseFormat } = params;
      const key = createHash('sha256')
        .update(JSON.stringify([model.provider, model.modelId, prompt, tools ?? [], toolChoice, temperature, maxOutputTokens, responseFormat]))
        .digest('hex');
```

### Step 2 — a fresh hit skips the model

```ts
      // 2. A hit that is still fresh: return the stored result without calling the model.
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) {
        stats.hits++;
        return hit.result as Awaited<ReturnType<typeof doGenerate>>;
      }
```

### Step 3 — a miss calls the model and stores the result

```ts
      // 3. A miss: call the model and remember the result.
      stats.misses++;
      const result = await doGenerate();
      entries.set(key, { at: Date.now(), result });
      return result;
```

The demo then asks the same question four times: plain, plain again, with a tool, and with a different temperature.

### Step 4 — compare a miss and a hit

```ts
  const first = await timed('first ask', {});
```

```ts
  const peek = (r: typeof first) => console.log(`    response.id=${r.response.id} timestamp=${r.response.timestamp.toISOString()} usage.totalTokens=${r.usage.totalTokens}`);
  peek(first);
  const second = await timed('same question again', {});
  peek(second);
  console.log('    same text as the first ask:', second.text === first.text);
```

The demo's `timed` helper now returns the result. We don't dump the full result of the miss and of the hit ([all the fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)); `peek` logs the three fields that differ or don't. At the end, `dump('cache.stats', cache.stats)` ([`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) prints the cache's counters: this is the first time this course shows them.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:06:offline
npm run post:06
# or: npx tsx 06-response-cache/example.ts
```

### What you should see

Live on the box (`qwen3:0.6b`):

Times and answers differ between runs. In one run:

```
first ask                           5718 ms   hits=0 misses=1
same question again                    1 ms   hits=1 misses=1
with a lookup tool                  6590 ms   hits=1 misses=2
with temperature 0.9                7543 ms   hits=1 misses=3
```

5.7 seconds became 1 millisecond. The tool and temperature calls were correctly **misses**. (This small model "thinks" at length, hence several seconds per answer.)

A later run, with the extra log lines (trimmed with "…"):

```
  first ask                            988 ms   hits=0 misses=1
    response.id=aitxt-OBGE2l3WZ12VbKrc8cWVPUOC timestamp=2026-10-24T15:58:41.061Z usage.totalTokens=112
  same question again                    1 ms   hits=1 misses=1
    response.id=aitxt-khqHyfMEYAVrG1xshllBysph timestamp=2026-10-24T15:58:41.061Z usage.totalTokens=112
    same text as the first ask: true
…
  with a lookup tool                   852 ms   hits=1 misses=2
  with temperature 0.9                1742 ms   hits=1 misses=3
▼ cache.stats
{ hits: 1, misses: 3 }
```

| Field | Miss vs hit |
| --- | --- |
| `text`, `usage` | Identical (`same text … true`, same `usage.totalTokens`): the stored model response was replayed. `usage` still reports 112 tokens, though none were used the second time. Don't bill from it after a cache. |
| `response.timestamp` | Identical: Ollama's own timestamp was stored with the response. (Offline the fake model sends none, so the AI SDK stamps each call with the current time.) |
| `response.id` | Different: Ollama sends no id, so the AI SDK makes a new one per call. |

## Common gotchas

- ❌ **Key = prompt only.** Different tools, model or settings get the wrong cached answer.
- ❌ **Caching personal answers in a shared cache.** A privacy incident waiting to happen.
- ❌ **No TTL.** Policy changes never reach users.
- ❌ **An in-memory `Map` on several servers.** Each has its own cache, and memory grows forever. In production use Redis (or similar) with TTL and a size limit.
- ❌ **Caching only `wrapGenerate`.** Streaming calls bypass it unless you also handle `wrapStream`.
- ✅ Caches help evals too: re-running unchanged cases becomes free (but turn it off when you're testing the model itself).

## Try it yourself

1. Remove `tools ?? []` from the key and run offline. Which call becomes a wrong hit?
2. Set `ttlMs: 1000`, add a 1.5 s wait between the first two asks, and watch the hit disappear.
3. Replace the `Map` with a small interface (`get`, `set`) so it could be backed by Redis.

## Key takeaways

- An **exact-match cache** is a middleware: hash the request, return a stored result on a hit.
- The key must include **model, prompt, tools and output-changing settings**.
- Use a **TTL**, and never share cached answers that depend on who's asking.

---

[← Previous: Middleware: one place for defaults and policies](../05-middleware-and-defaults/README.md) · [📚 Series index](../README.md) · [Next: A cost ledger and a budget →](../07-cost-ledger/README.md)
