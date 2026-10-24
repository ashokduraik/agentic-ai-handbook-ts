# Post 05 · Middleware: one place to enforce defaults and policies

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 5 of 8 · about 20 minutes*

> One developer forgot `maxOutputTokens`, and a looping answer ran to 8,000 tokens on every request for a week. Another set `temperature: 1.2` "to sound friendlier" on the dosage helper. You need some settings to apply to **every** call, without trusting every caller to remember.

---

## The idea, in plain English

**Middleware** is code that sits between your app and the model and sees every call. You've met the idea in web servers (Express middleware sees every HTTP request). In the AI SDK, `wrapLanguageModel({ model, middleware })` returns a new model that behaves the same but runs your middleware on every call. Hand that wrapped model to the app, and nobody can forget the policy.

A middleware is an object with optional hooks:

- **`transformParams`** changes the call *before* the model sees it: add defaults, add a safety instruction, strip something.
- **`wrapGenerate`** runs *around* the call: code before and after `doGenerate()`. Timing, caching (post 06), cost accounting (post 07), retries. (`wrapStream` is the same for streaming.)

The SDK ships ready-made ones; `defaultSettingsMiddleware` fills in settings such as `temperature` and `maxOutputTokens` **unless the call sets them itself**.

### Order matters

With several middlewares, the **first one in the list is the outermost**: it sees the call first and the result last. Like layers of an onion:

```
app → [outer log] → [defaults] → [inner log] → [timer] → model
```

---

## Let's see it in code

Open [`example.ts`](./example.ts).

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`) and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — a `transformParams` middleware

```ts
// 1. A middleware is an object with optional hooks. transformParams changes the call BEFORE the model sees it.
const logParams = (name: string): LanguageModelMiddleware => ({
  specificationVersion: 'v4',
  transformParams: async ({ params }) => {
    console.log(`  ${name.padEnd(6)} sees temperature=${params.temperature} maxOutputTokens=${params.maxOutputTokens}`);
    return params; // must return the (possibly changed) params
  },
});
```

### Step 2 — a `wrapGenerate` middleware

```ts
// 2. wrapGenerate runs AROUND the model call: code before and after doGenerate().
const timer: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  wrapGenerate: async ({ doGenerate, model }) => {
    const t0 = performance.now();
    const result = await doGenerate(); // ← the actual model call
    console.log(`  timer  ${model.modelId} took ${Math.round(performance.now() - t0)} ms`);
    return result;
  },
};
```

### Step 3 — wrap once

```ts
// 3. Wrap once, use everywhere. The FIRST middleware in the list is the OUTERMOST.
const governed = (model: ModelObject) =>
  wrapLanguageModel({
    model,
    middleware: [
      logParams('outer'), // sees the call as the app made it
      defaultSettingsMiddleware({ settings: { temperature: 0, maxOutputTokens: 512 } }),
      logParams('inner'), // sees it after the defaults were applied
      timer,
    ],
  });
```

Putting a log on each side of `defaultSettingsMiddleware` shows exactly what it changed.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:05:offline
npm run post:05
# or: npx tsx 05-middleware-and-defaults/example.ts
```

### What you should see

```
A call that sets nothing: the defaults fill in
  outer  sees temperature=undefined maxOutputTokens=undefined
  inner  sees temperature=0 maxOutputTokens=512
  timer  qwen3:0.6b took 275 ms
A call that sets its own limit: the call wins over the default
  outer  sees temperature=undefined maxOutputTokens=200
  inner  sees temperature=0 maxOutputTokens=200
```

Offline adds a self-check: `✅ defaults applied, and the per-call value won`.

## Common gotchas

- ❌ **Defaults are not limits.** `defaultSettingsMiddleware` lets a call override them. For a hard cap, write a `transformParams` that clamps: `Math.min(params.maxOutputTokens ?? 512, 512)`.
- ❌ **Forgetting to return `params`** (or the result) from a hook. The call breaks in confusing ways.
- ❌ **Wrong order.** A cache outside the ledger means hits cost nothing; the other way round, hits are billed as calls. Think about the onion.
- ❌ **Wrapping only `wrapGenerate`** when the app streams. Add `wrapStream` too.
- ✅ Wrap models in one place (the factory or the gateway) and hand only wrapped models to the app.

## Try it yourself

1. Turn the defaults into a hard cap with a `transformParams` that clamps `maxOutputTokens` to 512. Check that a call asking for 2,000 gets 512.
2. Write a middleware that adds "Never give dosage advice; refer to a pharmacist." to every call. (Hint: `params.prompt` is a list of messages; add a system message at the start.)
3. Move `timer` to the front of the list. What does it measure now?

## Key takeaways

- **Middleware** sees every call: `transformParams` before, `wrapGenerate` / `wrapStream` around.
- `wrapLanguageModel` returns a normal model; give the app only wrapped models.
- **First in the list = outermost.** Order changes behaviour.
- `defaultSettingsMiddleware` sets defaults; a call can still override them.

---

[← Previous: Model aliases](../04-model-aliases/README.md) · [📚 Series index](../README.md) · [Next: A response cache →](../06-response-cache/README.md)
