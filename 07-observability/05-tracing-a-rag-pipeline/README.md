# Post 05 · Tracing a RAG pipeline

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 5 of 6 · about 30 minutes*

> A doctor reports: "Yesterday it said the no-show deposit was free parking." Was retrieval wrong (it found the parking policy)? Or did retrieval work and the model mix things up? Without a trace, you re-run the question today, get a different answer, and close the ticket as "can't reproduce".
>
> With one span per stage and the right attributes, yesterday's request tells you exactly which stage went wrong.

---

## The idea, in plain English

A RAG request (lesson 04) has stages: **retrieve** the relevant documents, then **generate** an answer from them. Each stage can be slow, and each can be *wrong* in its own way. So give each stage a span, and record two kinds of facts on it:

- **How long it took.** In the box run below, embedding took 2.2 s on the first request (the embedding model was loading) and generation 0.6 s. Without stage spans you'd blame the chat model.
- **How good it looked.** For retrieval: how many candidates, which document ids came back, the top similarity score. For generation: which sources were cited, and whether those citations point at documents we actually retrieved.

These quality signals are the same ones your evals (lesson 05) measure offline, now visible **per production request**. A low `app.top_score` means retrieval was unsure. `app.citations_valid=false` means the model cited something it wasn't given.

```
rag.request
├─ rag.retrieve      app.top_ids=["no-show","parking"]  app.top_score=0.761
│  └─ embeddings …   (AI SDK spans)
└─ rag.generate      app.citations=["no-show"]  app.citations_valid=true
   └─ invoke_agent … (AI SDK spans)
```

Be careful with the question text. `gen_ai.retrieval.query.text` is a standard attribute, and fine for policy questions, but a question like "What does Fatima's MRI show?" is PHI. Decide per feature.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It's a self-contained mini RAG over four clinic policy snippets, so you don't need lesson 04's database. Offline, a toy word-count embedding and a scripted model stand in.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `embeddingModel()` returns the embedding model from `.env` (`EMBED_MODEL`); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — the request span and the retrieval stage

```ts
await tracer.startActiveSpan('rag.request', async (root) => {
```

```ts
    const top = await tracer.startActiveSpan('rag.retrieve', async (span) => {
      span.setAttribute(ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT, question); // fine here: a policy question, not PHI
```

Each stage is a span inside the request span. The AI SDK's embedding spans nest inside `rag.retrieve` automatically.

```ts
      console.log(`embedMany: ${embeddings.length} vectors of ${embeddings[0]!.length} numbers, usage.tokens=${many.usage.tokens}`);
```

```ts
      console.log(`embed: 1 vector of ${one.embedding.length} numbers, usage.tokens=${one.usage.tokens}`);
```

We log only the vector count and size, and `usage.tokens`: the same number the AI SDK puts on the embedding span. The full `embedMany()` and `embed()` results are in [lesson 01, post 06](../../01-foundations-structured-output/06-embeddings/README.md).

### Step 2 — retrieval quality on the span

```ts
      const ranked = docs
        .map((d, i) => ({ ...d, score: cosineSimilarity(embedding, embeddings[i]!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      span.setAttributes({ 'app.candidates': docs.length, 'app.top_ids': ranked.map((d) => d.id), 'app.top_score': Number(ranked[0]!.score.toFixed(3)) });
```

Rank by cosine similarity, keep the top 2, and record what came back and how confident it looked. Just before `setAttributes`, the example dumps ([`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) the two hits with their scores:

```ts
      dump('top 2 hits', ranked);
```

### Step 3 — generation, with a citation check

```ts
      const cited = [...stripThinking(text).matchAll(/\[([\w-]+)\]/g)].map((m) => m[1]!);
      const valid = cited.length > 0 && cited.every((id) => top.some((d) => d.id === id)); // cited only what we retrieved?
      span.setAttributes({ 'app.citations': cited, 'app.citations_valid': valid });
```

```ts
      console.log(`generateText: inputTokens=${result.usage.inputTokens} outputTokens=${result.usage.outputTokens}`);
```

We log the usage and don't print the full answer result ([its fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)); the check reads only its `text`.

A cheap, deterministic quality check on every request. In your backend you can then search for `app.citations_valid = false` and read exactly those traces.

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:05:offline                                # toy embedding + scripted answer
npm run post:05                                        # EMBED_MODEL + CHAT_MODEL
npx tsx 05-tracing-a-rag-pipeline/example.ts "Is the pharmacy open on Saturday?"
```

### What you should see

Live on the box (`qwen3-embedding:0.6b` + `qwen3:0.6b`), trimmed with "…". Vectors, scores, token counts and the answer differ between runs:

```
[span]   └─ embeddings qwen3-embedding:0.6b (2532 ms) operation.name="embeddings" provider.name="ollama.embedding" request.model="qwen3-embedding:0.6b" usage.input_tokens=91
[span]   └─ embeddings qwen3-embedding:0.6b (2533 ms) operation.name="embeddings" provider.name="ollama.embedding" request.model="qwen3-embedding:0.6b"
embedMany: 4 vectors of 1024 numbers, usage.tokens=91
…
embed: 1 vector of 1024 numbers, usage.tokens=9
…
▼ top 2 hits
[
  {
    id: 'no-show',
    text: 'A no-show deposit of 50 SAR is charged when an appointment is missed without 24 hours notice.',
    score: 0.7615257729156175
  },
  {
    id: 'parking',
    text: 'Outpatient parking is in building C. The first two hours are free.',
    score: 0.396615425567917
  }
]
[span]   └─ rag.retrieve (2594 ms) app.candidates=4 app.top_ids=["no-show","parking"] app.top_score=0.762
…
generateText: inputTokens=110 outputTokens=28
[span]   └─ rag.generate (674 ms) app.citations=["no-show"] app.citations_valid=true
```

| Field | What it means |
| --- | --- |
| `embedMany: 4 vectors of 1024 numbers` | One 1024-number vector per document, in the same order as the input texts. |
| `usage.tokens` | Tokens embedded: 91 for the four docs, 9 for the question. The span shows the same as `usage.input_tokens`. |
| Two `embeddings` spans per call | The AI SDK writes an outer span for the `embedMany`/`embed` call and an inner one for the model call. Only one of them carries the token count. |
| `score` | Cosine similarity. The right doc scored 0.76, the next only 0.40: a clear gap. A small gap would be a warning sign worth recording. |

- **Offline**: `rag.retrieve … app.top_ids=["no-show","visiting"]`, `rag.generate … app.citations=["no-show"] app.citations_valid=true`, and the answer *The no-show deposit is 50 SAR [no-show].*
- **Live**: `rag.retrieve` takes over 2 s, almost all of it the first embedding call while the model loads; `rag.generate` well under 1 s; citations valid. In the run above the answer included 50 SAR. In an earlier run, it said the deposit "is charged" **without saying 50 SAR**: retrieval was right, the citation was right, and the answer was still incomplete. The trace narrows a problem like that to generation.

## Common gotchas

- ❌ **One span for the whole RAG call.** You can't tell retrieval problems from generation problems.
- ❌ **Only timing.** Record quality signals too: scores, ids, citation checks.
- ❌ **Putting retrieved document text or PHI-laden questions on spans** without thinking. Ids are usually enough.
- ❌ **Embedding the documents on every request.** We do it here to stay self-contained; real RAG embeds at ingest time (lesson 04).
- ❌ **Small models drop details** even with the right sources, as the live run shows. Valid citations ≠ a complete answer; that's what evals are for.
- ✅ Trace lesson 04's real pipeline the same way: one span per stage (embed, keyword search, fuse, rerank, generate).

## Try it yourself

1. Ask something the documents don't cover ("Do you offer dental implants?"). What are `app.top_score` and the answer? Add an `app.answerable` attribute.
2. Add a `rag.rerank` stage between retrieve and generate that keeps only documents scoring above 0.5.
3. Wrap lesson 04's `retrieve()` and `answer()` in spans the same way.

## Key takeaways

- Give each RAG stage its own span, so slowness and mistakes point at a stage.
- Record **quality signals** (top score, ids, citation validity) next to timings.
- These are your offline eval metrics, now visible per production request.
- Be deliberate about putting questions and documents on spans.

---

[← Previous: Tokens, latency and cost per request](../04-tokens-latency-cost/README.md) · [📚 Series index](../README.md) · [Next: Sending traces somewhere useful: Jaeger and Langfuse →](../06-backends-jaeger-and-langfuse/README.md)
