# Post 04 · Tokens, latency and cost per request

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 4 of 6 · about 30 minutes*

> Finance forwards the AI invoice: double last month's. "Which feature? Which model? Is it worth it?" Your average latency dashboard says 600 ms and looks fine, yet the clinic staff say some answers take five seconds.
>
> Averages hide both problems. This post turns traces into the three numbers that matter per model: cost per request, typical and worst-case latency, and how many tokens requests really use.

---

## The idea, in plain English

### Cost comes from tokens

Hosted models charge per token, with different prices for **input** (what you send) and **output** (what the model writes). Output is usually several times more expensive. So:

```
cost of one request = input tokens × input price  +  output tokens × output price
```

Prices are quoted per **million tokens** ("per MTok"). Keep them in configuration (`PRICE_PER_MTOK_IN`, `PRICE_PER_MTOK_OUT`), not in code; they change. Self-hosted models (like Ollama on your own machine) don't charge per token; their cost is the machine, so leave the prices at 0.

A useful habit: talk about **cost per 1,000 requests**. "$0.13 per thousand questions" is something a manager can compare with a nurse's time.

### Latency: percentiles, not averages

If 19 requests take 300 ms and one takes 6 s, the average is 585 ms: it looks fine, and describes nobody. Use **percentiles**:

- **p50** (the median): half of requests are faster. The typical experience.
- **p95**: 95% are faster. The slowest 1 in 20 users feel this. Alerts and service targets usually use p95 or p99.

LLM latency depends heavily on **output length**: models write one token at a time. That's why the token histogram matters too.

### A token histogram

Counting how many requests used 0–99, 100–199, 200–299 output tokens shows you the *shape* of usage. A long tail of 2,000-token answers is where cost and slowness hide, and it tells you whether a `maxOutputTokens` limit or a "be brief" instruction would help.

### Where the numbers come from

Every model-call span from [post 03](../03-ai-sdk-telemetry/README.md) already has the model, the token counts and the duration. A tracing backend aggregates them for you on dashboards. Here we do it by hand, from spans in memory, so you see exactly how.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It sends six patient questions to two models, then analyses the spans. Offline, two fake models stand in: `small-fast` and `large-slow`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — prices from configuration

```ts
// 1. Prices are configuration, not code. Self-hosted models cost GPU-hours, not tokens: leave them 0.
const PRICE_IN = Number(optional('PRICE_PER_MTOK_IN', offline ? '0.15' : '0')); // offline: example prices
const PRICE_OUT = Number(optional('PRICE_PER_MTOK_OUT', offline ? '0.60' : '0'));
```

Offline uses made-up example prices so the cost columns aren't all zero.

### Step 2 — read the spans back

```ts
const rows = tracing.memory!.getFinishedSpans()
  .filter((s) => s.attributes['gen_ai.operation.name'] === 'invoke_agent')
```

The `invoke_agent` span is the AI SDK's top-level span for one `generateText` call. It carries the model and the total tokens for all steps.

```ts
    return {
      model: String(s.attributes['gen_ai.request.model']),
      ms: s.duration[0] * 1e3 + s.duration[1] / 1e6,
      input,
      output,
      costUsd: (input * PRICE_IN + output * PRICE_OUT) / 1e6, // 3. cost per request
    };
```

A span's `duration` is `[seconds, nanoseconds]`. Cost is the formula from above, divided by a million because prices are per million tokens.

### Step 3 — percentiles

```ts
// 4. Percentiles: p50 is the typical request, p95 is what your slowest 1-in-20 users feel.
const percentile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
```

Sort, then pick the value at that position. (Backends use cleverer methods for millions of values, but the idea is the same.)

### Step 4 — the histogram

```ts
  for (const r of mine) {
    const from = Math.floor(r.output / 100) * 100;
    buckets.set(from, (buckets.get(from) ?? 0) + 1);
  }
```

Each request goes into a 100-token bucket; each `█` is one request.

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:04:offline   # two fake models, example prices (~7 s)
npm run post:04           # CHAT_MODEL and FALLBACK_MODEL from .env
# or: npx tsx 04-tokens-latency-cost/example.ts [--offline]
```

### What you should see

Offline:

```
small-fast     requests=6  p50=296 ms  p95=403 ms  cost=$0.000237  (≈ $0.0396 per 1,000 requests)
   output    0–99   tokens │██████ 6
large-slow     requests=6  p50=787 ms  p95=1073 ms  cost=$0.000771  (≈ $0.1285 per 1,000 requests)
   output  100–199  tokens │███ 3
   output  200–299  tokens │███ 3
```

The larger model is about 3× the cost and 3× the latency, because it writes about 3× the tokens.

Live on the box (`qwen3:0.6b` and `qwen2.5:0.5b`), all answers were under 100 tokens and cost $0 (no prices set). The first `qwen2.5:0.5b` request took 1.8 s while the model loaded into memory, the rest 160–430 ms. With only six requests, that one cold start *is* the p95.

## Common gotchas

- ❌ **Averages.** Use p50 and p95 (and p99 with enough traffic).
- ❌ **p95 from six requests.** It's just the slowest one. Percentiles need volume.
- ❌ **Cold starts in your numbers.** Local models load on the first call. Warm up, or exclude the first request when comparing models.
- ❌ **One price for input and output.** Output usually costs several times more.
- ❌ **Forgetting hidden tokens.** Tool definitions, instructions, RAG context and re-sent history all count as input tokens. "Thinking" models may bill reasoning tokens as output.
- ✅ Report cost per 1,000 requests, per feature and per model.

## Try it yourself

1. Set `PRICE_PER_MTOK_IN=0.15 PRICE_PER_MTOK_OUT=0.60` and run the live version. What would 100,000 questions a month cost?
2. Change the instructions to "Answer in at most five words." How do the histogram and p50 change?
3. Group the rows by `functionId` (add one per question type) instead of by model.

## Key takeaways

- **Cost = input tokens × input price + output tokens × output price**, with prices from configuration.
- Use **p50 and p95**, not averages; LLM latency follows output length.
- A **token histogram** shows where cost and slowness hide.
- All of it comes from the spans you already have; a backend's dashboards do the same maths at scale.

---

[← Previous: Let the AI SDK write the spans](../03-ai-sdk-telemetry/README.md) · [📚 Series index](../README.md) · [Next: Tracing a RAG pipeline →](../05-tracing-a-rag-pipeline/README.md)
