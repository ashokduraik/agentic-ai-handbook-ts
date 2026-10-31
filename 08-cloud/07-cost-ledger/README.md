# Post 07 · A cost ledger and a budget

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 7 of 8 · about 20 minutes*

> A test script with a bug looped all weekend against the cloud model. Monday's bill: four figures. Nobody noticed because nothing was counting, and nothing could say "stop".

---

## The idea, in plain English

[Lesson 07](../../07-observability/04-tokens-latency-cost/README.md) showed how to compute cost from traces, *after the fact*. A **ledger** does it *live*, inside the app: every call adds its tokens and dollars to a running total per model. Once you have a running total, you can enforce a **budget**: refuse new calls once the limit is reached.

```
cost of a call = input tokens × input price  +  output tokens × output price   (prices per million tokens)
```

Both are middleware (post 05). The budget check runs **before** the call, so a refused call costs nothing. In a real system you'd keep budgets per team, per feature or per day, in a shared store, and alert at 80% before blocking at 100%.

Self-hosted models (Ollama, vLLM) don't charge per token, so their prices stay 0. The ledger still counts tokens, which is what your GPUs spend their time on.

---

## Let's see it in code

Open [`example.ts`](./example.ts). `createLedger()` returns the middleware, the per-model rows and a `spent()` function. Post 08 reuses it.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — check the budget first

```ts
      // 1. The budget check runs BEFORE the call, so an over-budget call costs nothing.
      if (spent() >= budgetUsd) throw new Error(`Budget of $${budgetUsd} reached: refusing a new call to ${model.modelId}`);
```

### Step 2 — add the call to the model's row

```ts
      // 2. Add this call's tokens and cost to the model's row.
      const input = result.usage.inputTokens.total ?? 0;
      const output = result.usage.outputTokens.total ?? 0;
      const p = pricesFor(model.modelId);
```

```ts
      row.usd += (input * p.inPerMTok + output * p.outPerMTok) / 1e6;
```

`pricesFor` takes a model id, so each model can have its own prices.

### Step 3 — prices are configuration

```ts
  // 3. Prices are configuration. Offline ignores .env and uses made-up prices that trip the $0.30
  // budget after three mock calls (so `test:offline` is stable even when PRICE_* is 0 in .env).
  const prices: Prices = offline
    ? { inPerMTok: 2000, outPerMTok: 8000 }
    : {
        inPerMTok: Number(optional('PRICE_PER_MTOK_IN', '0')),
        outPerMTok: Number(optional('PRICE_PER_MTOK_OUT', '0')),
      };
```

The offline prices are absurdly high on purpose, so a $0.30 budget runs out after three questions.

### Step 4 — the numbers behind the table

```ts
      if (q === questions[0]) console.log(`     first call usage: inputTokens=${r.usage.inputTokens} outputTokens=${r.usage.outputTokens}`);
```

```ts
  dump('ledger.rows', ledger.rows);
```

We log only the first call's usage (the full result and [all its fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned) are in lesson 01, post 00), and the budget error's message is in the `⛔` line. [`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value) prints the raw ledger `Map` behind the table: this is the first time the course shows it.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:07:offline
npm run post:07                                                # prices default to 0 (self-hosted)
PRICE_PER_MTOK_IN=0.15 PRICE_PER_MTOK_OUT=0.60 npm run post:07  # pretend it's a paid API
# or: npx tsx 07-cost-ledger/example.ts
```

### What you should see

Offline:

```
✅ When is the lab open?            spent so far $0.1320
✅ Where do I park?                 spent so far $0.2640
✅ Can I eat before a blood test?   spent so far $0.3960
⛔ How do I get my results?         Budget of $0.3 reached: refusing a new call to mock-model
⛔ Who do I call after hours?       Budget of $0.3 reached: refusing a new call to mock-model
```

Around those lines (trimmed with "…"):

```
✅ When is the lab open?            spent so far $0.1320
     first call usage: inputTokens=30 outputTokens=9
…
▼ ledger.rows
Map(1) { 'mock-model' => { calls: 3, input: 90, output: 27, usd: 0.396 } }
```

One call: 30 × $2,000 + 9 × $8,000 per million tokens = $0.132, which is the first "spent so far". The budget error is a plain `Error` thrown by our middleware before `doGenerate()`, so no model was called and no tokens were used.

Notice that spending ended at $0.396, **over** the $0.30 budget: the third call started at $0.264 (under budget) and finished above it. Live on the box, five calls cost $0 (no prices set). Token counts differ between runs: one run used 113 input and 370 output tokens; a later one 113 and 615 (`Map(1) { 'qwen3:0.6b' => { calls: 5, input: 113, output: 615, usd: 0 } }`).

## Common gotchas

- ❌ **"Before the call" can't know the cost.** A budget check can overshoot by one call. To be strict, reserve an estimate first (`maxOutputTokens × output price`), then settle the real cost.
- ❌ **An in-memory ledger** resets on restart and isn't shared across servers. Use a database or your gateway's budgets.
- ❌ **Forgetting hidden tokens**: instructions, tool definitions and RAG context are input tokens; "thinking" can be output tokens.
- ❌ **Hard-coded prices.** They change. Keep them in configuration.
- ✅ Alert early (80%), block late (100%), and put cost per feature on a dashboard (lesson 07).

## Try it yourself

1. Make the budget strict: reserve `maxOutputTokens × outPerMTok / 1e6` before the call and refuse if that would cross the limit.
2. Give `pricesFor` a small table, so two models have different prices, and run the ledger with both aliases from post 04.
3. Turn the error into a fallback: when the budget is reached, answer "The assistant is temporarily unavailable; please call reception" instead of throwing.

## Key takeaways

- A **ledger** middleware counts calls, tokens and dollars per model as they happen.
- A **budget** check refuses calls past a limit; it can overshoot by one call unless you reserve.
- Keep prices and budgets in configuration, and ledgers in a shared store in production.

---

[← Previous: A response cache](../06-response-cache/README.md) · [📚 Series index](../README.md) · [Next: Routing cheap vs expensive: the gateway →](../08-routing-cheap-vs-expensive/README.md)
