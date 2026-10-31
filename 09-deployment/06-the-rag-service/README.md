# Post 06 · The RAG service: posts 01–05 around the lesson 04 pipeline

*Series: [Lesson 09 — Deployment](../README.md) · Post 6 of 9 · about 30 minutes*

> You have validation, timeouts, load shedding, readiness and graceful shutdown as five separate demos. The ward needs one thing: a URL that answers "How much is the no-show deposit?" correctly, quickly and safely, and keeps doing it while you deploy.

---

## The idea, in plain English

This post assembles the service. It's split into three files, each with one job:

- **[`app.ts`](./app.ts)**: the HTTP app. `createApp(deps)` handles `/healthz`, `/readyz` and `POST /ask`, using the pieces from posts 01–05, and writes **one JSON log line per request** (method, path, status, milliseconds, requests in flight).
- **[`server.ts`](./server.ts)**: the entry point. It opens lesson 04's index (ingesting the documents if it's empty), provides the **real** `ask` and `ready` functions, installs graceful shutdown, and listens on `PORT`.
- **[`example.ts`](./example.ts)**: a **smoke test** with a *fake* pipeline, so CI can test every HTTP behaviour without a model; and, live, one real question over HTTP.

The key design choice is **dependency injection**: `createApp` doesn't know what answers questions. It gets an `ask` function. Tests pass a fake; the server passes the real pipeline. That's why CI can check the HTTP layer in under a second.

The server runs on **plain Node, with no build step**: Node strips TypeScript types itself, so `node 06-the-rag-service/server.ts` just works, and the container (post 07) ships the source.

---

## Let's see it in code

### Step 1 — the dependencies the app needs

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output; `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; and `optional(name, default)` reads an optional setting from the environment. [More about these helpers](../../shared/README.md).

```ts
export interface Deps {
  ask(question: string, abortSignal: AbortSignal): Promise<AskResult>; // must pass abortSignal on to the model call
  ready(): Promise<{ ready: boolean; reason: string }>;
  maxConcurrent: number;
  timeoutMs: number;
}
```

### Step 2 — `/ask`, using posts 01–03

```ts
    if (!limiter.tryAcquire()) {
      res.setHeader('retry-after', '2');
      log(429);
      return send(res, 429, { error: 'busy, retry later' });
    }
```

```ts
      const parsed = AskBody.safeParse(await readJson(req));
```

```ts
      const result = await deps.ask(parsed.data.question, requestSignal(res, deps.timeoutMs));
```

```ts
      const status = isTimeout(e) ? 504 : e instanceof HttpError ? e.status : 500;
```

Health and readiness are answered *before* the limiter, so a busy pod still answers its probes.

### Step 3 — the real pipeline, with the signal

```ts
      const { top } = await retrieve(store, question);
```

```ts
      // 2. The same grounded answer as lesson 04, plus abortSignal: a timeout cancels the model call.
      const { output } = await generateText({
        model: chatModel(),
        temperature: 0,
        output: Output.object({ schema: GroundedAnswer }),
```

```ts
        abortSignal,
```

```ts
      return { ...output, citationsValid: checkCitations(output, top.length).citationsValid };
```

`retrieve`, `GroundedAnswer` and `checkCitations` come from lesson 04 (`@learn/rag`). We write our own `generateText` call here so the timeout signal reaches the model.

### Step 4 — start and drain

```ts
  installGracefulShutdown(app, { onDraining: app.startDraining }); // 3. SIGTERM → drain (post 05)
```

### Step 5 — the smoke test

```ts
  assert.equal((await ask('hi')).status, 400, 'too short → 400');
```

```ts
  assert.deepEqual([a.status, b.status].sort(), [200, 429], 'second concurrent request is shed');
  assert.equal((await ask('a slow question')).status, 504, 'timeout → 504');
```

### Step 6 — look at the responses

The smoke test dumps one `/ask` response, `status` and `json` only, because this is the first time you see the service's `AskResult` body. The live run just prints `status` and `json` for `/readyz` and `/ask`. The full HTTP response shape (headers and all) is in [post 01](../01-validate-at-the-edge/README.md#step-4--look-at-the-full-response). `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
  // The service's response body, dumped once: the first time you see the AskResult JSON. Only `status` and
  // `json`: the full HTTP response shape (headers and all) is in lesson 09, post 01.
  dump('POST /ask: status and json', { status: ok.status, json: await ok.clone().json() });
```

```ts
  // /readyz: 200 with { ready, reason } when the models are pulled, 503 otherwise. Just status and json.
  console.log('readyz:', ready.status, await ready.json());
```

```ts
  // /ask: the JSON is the AskResult: answer, citations, answerable, citationsValid. (Dumped once in the
  // smoke test; the full HTTP response shape is in lesson 09, post 01.)
  console.log('ask:', r.status, await r.json());
```

`server.ts` and `app.ts` themselves don't dump the `retrieve()` or `generateText()` results. This is the production server: dumping every result would write patients' questions and the hospital documents into your logs on every request (lesson 07 covers what belongs in logs). The one JSON log line per request stays the server's only output. To see those full results, run lesson 04's examples, which dump both.

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:06:offline   # the smoke test (CI runs this)
npm run post:06           # the real pipeline, one question over HTTP
npm start                 # the real server on :8080
# or: npx tsx 06-the-rag-service/example.ts
curl -s localhost:8080/ask -H 'content-type: application/json' -d '{"question":"How much is the no-show deposit?"}'
```

The first real run ingests `04-rag/docs` into `09-deployment/data/rag.db` (set `RAG_DB_PATH` to change it).

### What you should see

Offline:

```
{"level":"info","method":"POST","path":"/ask","status":400,"ms":2,"inFlight":1}
{"level":"info","method":"POST","path":"/ask","status":200,"ms":101,"inFlight":1,"answerable":true,"citationsValid":true}
▼ POST /ask: status and json
{
  status: 200,
  json: {
    answer: 'echo: How much is the deposit? [1]',
    citations: [ 1 ],
    answerable: true,
    citationsValid: true
  }
}
{"level":"info","method":"POST","path":"/ask","status":429,"ms":0,"inFlight":1}
{"level":"info","method":"POST","path":"/ask","status":200,"ms":100,"inFlight":1,"answerable":true,"citationsValid":true}
{"level":"info","method":"POST","path":"/ask","status":504,"ms":301,"inFlight":1,"error":"The operation was aborted due to timeout"}
✅ smoke test passed: healthz, readyz, validation 400, answer 200, load-shedding 429, timeout 504, draining 503
```

Node also prints an `ExperimentalWarning` about SQLite (lesson 04's index uses `node:sqlite`). It's harmless. Millisecond values vary a little from run to run.

The `json` is exactly an `AskResult`. The fake pipeline echoes the question; the real one fills the same four fields.

Live (`qwen3.8:latest`, `qwen3-embedding:4b`, first run, so the index was empty and got ingested):

```
{"level":"info","msg":"index empty, ingesting docs"}
readyz: 200 { ready: true, reason: 'both models pulled' }
{"level":"info","method":"POST","path":"/ask","status":200,"ms":16215,"inFlight":1,"answerable":true,"citationsValid":true}
ask: 200 {
  answer: 'SAR 100',
  citations: [ 1 ],
  answerable: true,
  citationsValid: true
}
```

The answer changes between runs. In this run the amount is right (SAR 100), though terse. `citationsValid: true` only means the citation numbers exist; it can't catch a wrong claim (post 09 and lesson 05 do). `ms` was 16215 this time, which includes the first-run ingest warm-up.

In an earlier run, on `qwen3:0.6b` and `qwen3-embedding:0.6b`, the answer was `A SAR 100 deposit is required for each new booking.`: the amount was right, but "for each new booking" is wrong, because the deposit applies after three no-shows. In another earlier run: `/readyz` → `both models pulled`; the deposit question → **200** in 2.5 s with `{ answer: '100', citations: [1], answerable: true, citationsValid: true }`, which is correct (SAR 100) but terse. Through `npm start` and curl, "Can I bring food for a patient?" (not in the documents) came back `answerable: false`, though the text still began "No, you cannot…": a small model claiming more than it knows. `SIGTERM` printed `draining`, then `drained, exiting`.

With `REQUEST_TIMEOUT_MS=500`, the answer was a **504 after 1573 ms**, not 500 ms: retrieval (embedding + reranking) doesn't take the signal, so the timeout only bit at the model call.

## Common gotchas

- ❌ **The signal stops at the last step.** As the live run shows, pass it to every slow step (here, `@learn/rag`'s `retrieve` would need an `abortSignal` parameter too).
- ❌ **Ingesting at startup for a real corpus.** Fine for five documents; for thousands, ingest in a separate job and use a volume or a managed vector database.
- ❌ **Testing only with the real model.** Slow, flaky and costly in CI. Inject a fake for the HTTP layer; test quality separately (post 09).
- ❌ **Logging the question text.** It may contain PHI. Log ids, statuses and timings.
- ✅ One JSON line per request is enough for dashboards: status counts, p95 latency, 429 rate.

## Try it yourself

1. Add an `abortSignal` check between retrieval and generation: `abortSignal.throwIfAborted()`. Does the 500 ms run now fail faster?
2. Add a `request_id` (from an `x-request-id` header, or a new UUID) to every log line and to the response.
3. Run `npm start`, then fire 10 parallel curls. How many 429s with `MAX_CONCURRENT=4`?

## Key takeaways

- `createApp(deps)` + `server.ts` + a smoke test: the HTTP layer is tested without a model.
- Every request: validate → limit → answer with an abort signal → one JSON log line.
- Plain Node runs the TypeScript directly: no build step.

---

[← Previous: Graceful shutdown](../05-graceful-shutdown/README.md) · [📚 Series index](../README.md) · [Next: The container image →](../07-container-image/README.md)
