# Post 04 · Model aliases: ask for a capability, not a model id

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 4 of 8 · about 15 minutes*

> A new model version comes out, cheaper and better. It's used in 23 places: the FAQ bot, the triage agent, the discharge summaries, the eval judge. Someone updates 21 of them. Two weeks later you find the other two still on the old model, which is about to be retired.

---

## The idea, in plain English

Code shouldn't know *which* model it uses, only *what kind* it needs: "something fast and cheap for FAQs", "something strong for clinical summaries". Give those needs names, **aliases**, and map each alias to a real model in one place:

```
fast   →  FAST_MODEL   (a small, cheap model)
smart  →  SMART_MODEL  (a stronger, pricier model)
```

Now upgrading "smart" is one configuration change, every caller moves together, and you can point the aliases at different providers (`smart` on Azure, `fast` on a local model).

The AI SDK's `customProvider` builds this: a provider whose model ids are your alias names. Asking for an alias that doesn't exist throws `NoSuchModelError`, so a typo fails loudly. In TypeScript, a type for the alias names catches it at compile time.

---

## Let's see it in code

Open [`example.ts`](./example.ts).

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the real models come from configuration

```ts
// 1. The real model behind each alias is configuration. Offline, two fakes stand in.
const smartId = offline ? 'big-model' : optional('SMART_MODEL', env.chatModel)!;
const fastId = offline ? 'small-model' : optional('FAST_MODEL', env.fallbackModel ?? env.chatModel)!;
```

### Step 2 — a provider that only knows aliases

```ts
// 2. One "provider" that knows only aliases. Asking for an unknown alias throws NoSuchModelError.
const models = customProvider({
  languageModels: {
    smart: offline ? fakeModel(smartId) : chatModel(smartId), // careful reasoning, longer answers, higher cost
    fast: offline ? fakeModel(fastId) : chatModel(fastId), // short FAQ answers, low cost
  },
});
```

### Step 3 — app code asks for an alias

```ts
// 3. A type for the alias names, so a typo is a compile error, not a 3 a.m. incident.
type Alias = 'smart' | 'fast';
```

```ts
    model: models.languageModel(alias),
```

`response.modelId` tells you which real model answered: log it (lesson 07), so traces show the model, not just the alias.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:04:offline
npm run post:04           # SMART_MODEL / FAST_MODEL, else CHAT_MODEL / FALLBACK_MODEL
# or: npx tsx 04-model-aliases/example.ts
```

### What you should see

```
[A] Aliases → models   smart=qwen3:0.6b   fast=qwen2.5:0.5b
fast  → { modelId: 'qwen2.5:0.5b', text: 'The pharmacy is open 24/7.' }
smart → { modelId: 'qwen3:0.6b', text: 'A patient on blood thinners should avoid an extraction to prevent blood loss…' }
```

Note the "fast" answer on the box: **"open 24/7" is made up**. The model had no pharmacy hours to go on. Aliases organise *which* model runs; they don't make answers grounded. That's RAG (lesson 04) and guards (lesson 06).

## Common gotchas

- ❌ **Aliases named after models** (`gpt-big`). Name the capability (`smart`, `fast`, `embed-docs`).
- ❌ **Silently changing what an alias points to.** It changes behaviour everywhere: re-run evals first, and log `response.modelId`.
- ❌ **Too many aliases.** Two or three cover most apps.
- ✅ Point aliases at different providers when it helps: strong cloud model for `smart`, local model for `fast`.

## Try it yourself

1. Set `FAST_MODEL=$CHAT_MODEL` and `SMART_MODEL=$FALLBACK_MODEL` (swap them). Nothing in the app code changes.
2. Add an `embed` alias using `customProvider`'s `embeddingModels` option.
3. Call `models.languageModel('smrt')` and read the error. Then see what TypeScript says with the `Alias` type.

## Key takeaways

- Code asks for **capabilities** (`smart`, `fast`); configuration maps them to models.
- `customProvider` builds the alias table; unknown aliases throw `NoSuchModelError`.
- One change upgrades every caller. Re-run evals when you do.

---

[← Previous: Amazon Bedrock: model access and the credential chain](../03-amazon-bedrock/README.md) · [📚 Series index](../README.md) · [Next: Middleware: one place for defaults and policies →](../05-middleware-and-defaults/README.md)
