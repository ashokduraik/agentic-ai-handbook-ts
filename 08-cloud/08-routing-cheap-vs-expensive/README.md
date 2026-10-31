# Post 08 · Routing cheap vs expensive: an in-process gateway

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 8 of 8 · about 30 minutes*

> Most questions to the front-desk assistant are "where is…?" and "what time…?". A small model answers them for a fraction of the price. A few are "explain the risks of…", which need the strong model. Send everything to the strong one and you overpay; send everything to the small one and clinical answers suffer.

---

## The idea, in plain English

A **gateway** is the one layer every model call goes through. This post assembles it from the previous posts:

- **aliases** (post 04): `smart` and `fast`
- **defaults** (post 05): temperature 0, a token cap
- a **cache** (post 06) and a **ledger** (post 07), shared by all aliases

Then it adds a **router**: a function that looks at the request and picks an alias. Start simple: short questions with FAQ words (*when, where, what time, how much*) go to `fast`; everything else goes to `smart`. Routers can get smarter (a tiny classifier model, or embedding similarity to known FAQ questions), but **measure** any router with your evals (lesson 05) before trusting it: a router that sends a clinical question to the small model is a quality bug.

### In-process vs managed gateways

This post's gateway lives *inside* your app. Platform teams often run the same ideas as a separate service, so that every app in the hospital shares keys, budgets and logs:

- **LiteLLM proxy**: open source; one OpenAI-compatible endpoint for many providers, with keys, budgets, fallbacks and logging. Your app talks to it with `AI_PROVIDER=openai-compatible` (post 01).
- **Azure API Management** (its AI gateway features): token limits, load balancing across deployments, logging.
- **Bedrock inference profiles** and **cross-region inference**: capacity and routing on AWS.

The concepts are the same; only where the code runs differs.

---

## Let's see it in code

Open [`example.ts`](./example.ts).

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — one cache and one ledger for everything

```ts
// 1. Shared policy objects: one cache and one ledger for the whole gateway.
const cache = createCache({ ttlMs: 10 * 60_000 });
const prices = { inPerMTok: Number(optional('PRICE_PER_MTOK_IN', '0')), outPerMTok: Number(optional('PRICE_PER_MTOK_OUT', '0')) };
const ledger = createLedger(() => prices);
```

`createCache` and `createLedger` are imported from posts 06 and 07.

### Step 2 — every model gets the same stack

```ts
// 2. Every model goes through the same middleware stack. Order matters: the cache sits OUTSIDE
//    the ledger, so a cache hit never reaches the ledger and costs nothing.
const governed = (model: ModelObject) =>
  wrapLanguageModel({
    model,
    middleware: [defaultSettingsMiddleware({ settings: { temperature: 0, maxOutputTokens: 512 } }), cache.middleware, ledger.middleware],
  });
```

```ts
const gateway = customProvider({
  languageModels: { smart: governed(base(smartId)), fast: governed(base(fastId)) },
});
```

### Step 3 — the router

```ts
// 3. A naive router. Cheap rules first; measure it with evals (lesson 05) before you trust it.
type Alias = 'smart' | 'fast';
function route(question: string): Alias {
  const looksLikeFaq = question.length < 60 && /\b(when|what time|where|how much|open)\b/i.test(question);
  return looksLikeFaq ? 'fast' : 'smart';
}
```

```ts
  const result = await generateText({ model: gateway.languageModel(alias), prompt: q });
```

```ts
  console.log(`response.modelId=${result.response.modelId}`);
```

`response.modelId` shows which model the router picked; the full result and [all its fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned) are in lesson 01, post 00. The first question is asked twice: once as a miss and once as a cache hit. At the end the example prints the ledger table and the cache counters, as before. The raw `ledger.rows` and `cache.stats` records are dumped in [post 07](../07-cost-ledger/README.md) and [post 06](../06-response-cache/README.md), so we don't repeat them here.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:08:offline
npm run post:08           # fast = FALLBACK_MODEL, smart = CHAT_MODEL (or FAST_MODEL / SMART_MODEL)
# or: npx tsx 08-routing-cheap-vs-expensive/example.ts
```

### What you should see

Live on the box (`fast` = `qwen2.5:0.5b`, `smart` = `qwen3:0.6b`):

Times, token counts and answers differ between runs. One run, condensed:

```
[B] fast · 615 ms     Q: What time should I arrive?
[B] fast · 1 ms       Q: What time should I arrive?            ← cache hit
[B] fast · 3220 ms    Q: Where is the radiology department?
[B] smart · 759 ms    Q: Summarise the risks of stopping blood thinners …
│ qwen2.5:0.5b │ 2 │ 71 │ 386 │ 0 │
│ qwen3:0.6b   │ 1 │ 37 │ 55  │ 0 │
cache hits=1 misses=3
```

A later run, with the extra `response.modelId` line (trimmed with "…"):

```
── [B] fast · 2024 ms ──────────────────────────────────────────
response.modelId=qwen2.5:0.5b
Q: What time should I arrive?
…
── [C] Ledger and cache ────────────────────────────────────────
…
cache hits=1 misses=3   total spent $0.0000
```

`response.modelId` shows the router's choice. In the first run above, the ledger table counts only 2 calls for `qwen2.5:0.5b` (the first ask and the radiology question): the cache hit never reached it.

Routing worked, but look at the radiology answer: the "fast" model misread the question and wrote a 300-token essay about what radiology *is*, taking longer than the "smart" model. Cheap per token isn't cheap per answer if the model rambles. With models this small, both answers are weak; with real cloud models the difference is clearer, and the ledger shows the saving.

## Common gotchas

- ❌ **Trusting a router you haven't measured.** Run your eval set through it; count clinical questions sent to `fast`.
- ❌ **Cache inside the ledger.** Hits get billed. Keep the cache outside.
- ❌ **No fallback.** If `smart` hits a 429 (Azure quota, post 02), the request fails. See the exercise.
- ❌ **Building a big in-process gateway when the organisation already has LiteLLM or API Management.** Use the shared one; keep in-process middleware for app-specific rules.
- ✅ Log the alias, the real model and the route reason on your spans (lesson 07), so you can audit routing decisions.

## Try it yourself

1. **The map's exercise: failover on 429.** Write a middleware that catches an error with `statusCode === 429` from `doGenerate()` and calls the *other* alias's model instead. Test it with `rateLimitedModel('smart-model')` from [`support/fakes.ts`](../support/fakes.ts) as the `smart` model, offline. (The cache key already includes tools, so you don't need to change it.)
2. Replace the keyword router with one that embeds the question and compares it with ten known FAQ questions (lesson 04's `embed` + `cosineSimilarity`).
3. Run a LiteLLM proxy in front of Ollama, set `AI_PROVIDER=openai-compatible`, and run post 08 through it. What moved out of your code?

## Key takeaways

- A **gateway** = aliases + defaults + cache + ledger (+ router), all as middleware around models.
- **Route** easy questions to cheap models, hard ones to strong models, and **measure** the router.
- The same ideas exist as managed services: **LiteLLM**, **Azure API Management**, **Bedrock inference profiles**.

---

[← Previous: A cost ledger and a budget](../07-cost-ledger/README.md) · [📚 Series index](../README.md) · [Next: Lesson 09 — Deployment →](../../09-deployment/README.md)
