# Post 00 · The course toolkit

*Series: [Lesson 01 — Foundations](../README.md) · Post 0 of 8 (read this first) · about 10 minutes*

> Every example in this course starts with a line like this:
>
> ```ts
> import { chatModel, dump, modelLabel, section, stripThinking } from '@learn/shared';
> ```
>
> Search npm for `@learn/shared` and you'll find nothing. It's ours. This short post explains what it is before you meet it in every file.

---

## The idea, in plain English

### A helper folder, not an npm package

`@learn/shared` is **a small helper library that lives inside this course**, in the `shared/` folder at the repo root. It's **not published on npm**.

The repo uses **npm workspaces** (the same feature you'd use in a monorepo). When you run `npm install` at the root, npm links `node_modules/@learn/shared` to the `shared/` folder. So the import just loads `shared/src/index.ts` from your own disk.

### Why the course has it

Two rules run through every lesson:

1. **The model is chosen only in `.env`.** No lesson file names a model.
2. **Changing provider is a config change.** Ollama today, Azure or Bedrock tomorrow: you edit `.env`, not code.

So instead of each example creating its own Ollama client, they all ask the toolkit: *"give me the chat model"*. It reads `.env` and builds the right one. It's the same thing you'd do in a backend: hide the vendor SDK behind one small factory.

```
 .env  ──►  shared/ (env.ts → chatModel())  ──►  AI SDK  ──►  Ollama | Azure | Bedrock
```

### The five helpers you'll see most

| Helper | What it does |
|---|---|
| `chatModel()` | Reads `AI_PROVIDER` and `CHAT_MODEL` from `.env` and returns a model object for the AI SDK. It does **not** call the model. |
| `modelLabel()` | Returns a label like `ollama:qwen3:8b` so the output shows which model actually ran. |
| `section(title)` | Prints a bold header line, so you can see where parts A, B, C… start in the output. |
| `stripThinking(text)` | Removes the `<think>…</think>` block that reasoning models (like Qwen3) write before their real answer. |
| `dump(label, value)` | Prints the **full** value a function returned (for example the whole `generateText` result), labelled and readable. Every example uses it after its important calls. |

There are a few more (`embeddingModel`, `show`, `isMain`, `required`, `optional`), and a setup check (`npm run check:ollama`). **[The full tour of `@learn/shared`](../../shared/README.md)** walks through every one of them with the real code. Read it now or come back to it later; you don't need it to follow the posts.

---

## Let's see it in code

Open [`example.ts`](./example.ts) next to this post. It's tiny on purpose.

### Step 1 — the import

```ts
import { generateText } from 'ai';
import { chatModel, dump, modelLabel, section, stripThinking } from '@learn/shared';
```

`generateText` comes from the Vercel AI SDK, the library that actually talks to models ([post 03](../03-model-calls-and-streaming/README.md) covers it). Everything else comes from our toolkit.

### Step 2 — what did `.env` pick?

```ts
section('[A] Which model is active?');
console.log('Active model:', modelLabel()); // e.g. "ollama:qwen3:8b" — comes only from .env
```

No model call yet. `modelLabel()` just reads `.env`. If you change `CHAT_MODEL` and run again, this line changes, and no code did.

### Step 3 — one call

```ts
const result = await generateText({
  model: chatModel(), // a model OBJECT built from .env; the network call happens inside generateText
  prompt: 'Reply with exactly: toolkit works',
  maxOutputTokens: 300, // room for a reasoning model's <think> block plus the answer
});
const { text } = result; // the field you usually want; the lines below show everything else
console.log('Raw text (first 120 chars):', JSON.stringify(text.slice(0, 120)));
console.log('After stripThinking:       ', JSON.stringify(stripThinking(text)));
```

`chatModel()` hands `generateText` a model object, and `generateText` makes the request. We print the text twice: once raw, once after `stripThinking`.

With Ollama, the two lines usually look the same: Ollama sends a reasoning model's thinking in a separate field, so `text` is already clean. Some other servers (for example an OpenAI-compatible server running a reasoning model) put `<think>…</think>` inside the text itself. Then the raw line starts with `<think>` and only the second line is the answer. Calling `stripThinking` every time means your code works either way.

### Step 4 — look at everything the call returned

```ts
section('[C] The full result object');
dump('generateText() result', result);
```

`text` is only one field of what `generateText` gives back. `dump()` is the toolkit's "show me the whole thing" helper: it prints the **full returned value**, labelled, in a readable layout. You'll see it after every important call in this course, so you always know what a function really returned, not just the one field we picked out. ([How `dump` works](../../shared/README.md#dumplabel-value--print-the-full-returned-value), and how to switch off its tidying with `SHOW_RAW=1`.)

Here is what the important fields of a `generateText` result mean. You will meet this object in almost every post, so it's worth reading once:

| Field | What it holds |
|---|---|
| `text` | The model's answer as one string. This is what most code uses. |
| `content` | The same answer as a list of **parts**: `{ type: 'text' }`, and also `{ type: 'reasoning' }`, `{ type: 'tool-call' }` and so on when there are any. `text` is the text parts joined together. |
| `reasoning` | The model's "thinking" parts, when the provider sends them separately. Empty here: the small qwen3 run below returned no separate thinking. |
| `toolCalls` / `toolResults` | Tools the model asked to run, and what they returned. Empty until [post 08](../08-tool-calling/README.md) gives the model tools. (`staticToolCalls`, `dynamicToolCalls` and friends are just filtered views of these lists.) |
| `finishReason` | Why the model stopped: `'stop'` (it finished), `'length'` (it hit `maxOutputTokens`, so the answer is cut off), `'tool-calls'` (it wants a tool run). Check it before trusting `text`. |
| `usage` | Tokens the provider counted: `inputTokens` (your prompt), `outputTokens` (the answer, including any thinking), `totalTokens`. This is your bill on a cloud API. With several steps it's the sum over all of them (as is `totalUsage`); each step's own count is in `steps[i].usage`. |
| `response` | Metadata about the reply: an `id`, the `modelId` that actually answered, a `timestamp`, and `messages`, the assistant message you'd append to a chat history. |
| `steps` | One entry per model call. A plain call has exactly one step. With tools ([post 08](../08-tool-calling/README.md)) the SDK may call the model several times, and each call is a step with its own `usage` and `performance` timings. |
| `warnings`, `providerMetadata` | Notes from the provider (for example "this setting is not supported") and any provider-specific extras. Usually empty. |

---

## Run it

From `01-foundations-structured-output/`:

```bash
npm run post:00
```

You should see something like this (captured from a real run with a small `qwen3:0.6b`; trimmed where you see `…`):

```
── [A] Which model is active? ──────────────────────────────────
Active model: ollama:qwen3:0.6b

── [B] One call ────────────────────────────────────────────────
Raw text (first 120 chars): "toolkit works"
After stripThinking:        "toolkit works"

── [C] The full result object ──────────────────────────────────
▼ generateText() result
DefaultGenerateTextResult {
  finalStep: [same as the last item of steps],
  content: [ { type: 'text', text: 'toolkit works' } ],
  text: 'toolkit works',
  files: [],
  reasoning: [],
  toolCalls: [],
  staticToolCalls: [subset of toolCalls],
  …
  finishReason: 'stop',
  rawFinishReason: 'stop',
  warnings: [],
  providerMetadata: { ollama: {} },
  response: {
    id: 'aitxt-qpAHcjpgPvKXuNvDvafOncAI',
    timestamp: 2026-10-24T15:15:20.720Z,
    modelId: 'qwen3:0.6b',
    headers: [hidden headers: 3 keys],
    messages: [
      { role: 'assistant', content: [ { type: 'text', text: 'toolkit works' } ] }
    ]
  },
  responseMessages: [same as response.messages],
  request: {},
  usage: {
    inputTokens: 22,
    inputTokenDetails: {},
    outputTokens: 4,
    outputTokenDetails: {},
    totalTokens: 26
  },
  output: 'toolkit works',
  initialResponseMessages: [],
  steps: [
    DefaultStepResult {
      text: 'toolkit works',
      …
      stepNumber: 0,
      model: { provider: 'ollama.responses', modelId: 'qwen3:0.6b' },
      content: [ { type: 'text', text: 'toolkit works' } ],
      finishReason: 'stop',
      usage: { inputTokens: 22, … outputTokens: 4, … totalTokens: 26 },
      performance: {
        effectiveOutputTokensPerSecond: 22.98,
        effectiveTotalTokensPerSecond: 149.36,
        stepTimeMs: 174.4,
        responseTimeMs: 174.07,
        toolExecutionMs: {}
      },
      …
    }
  ],
  totalUsage: { inputTokens: 22, … outputTokens: 4, … totalTokens: 26 }
}
  (hidden for readability: response.headers, steps[].response.headers — set SHOW_RAW=1 to print everything)
```

Your model name, `id`, `timestamp`, token counts and timings will be different; the **shape** is what matters. Notice that the single entry in `steps` repeats the top-level fields: with no tools there is only one model call, so the "last step" *is* the whole result. `totalUsage` adds up `usage` over all steps (the same here). Lines in square brackets like `[hidden headers: 3 keys]` are `dump`'s tidying, not part of the data; run with `SHOW_RAW=1 npm run post:00` to see everything untouched.

The model name comes from your `.env`. A very small model may not follow the instruction exactly (for example it replies `toolkit works with the user's needs…`); that's the model, not the toolkit.

If you get `Missing env var CHAT_MODEL`, create `.env` at the repo root (see the [series index](../README.md#set-up-once-10-minutes)). If you get a connection error, run `npm run check:ollama` from the repo root.

## Try it yourself

1. Change `CHAT_MODEL` in `.env` to another model from `ollama list` and run again. Which lines change?
2. Pass a different model just for this call: `chatModel('qwen3-embedding:4b')` won't work (it's an embedding model). Try another chat model name from `ollama list` instead, without touching `.env`. This is the per-call override described in the [toolkit tour](../../shared/README.md#the-per-call-override).

## Key takeaways

- `@learn/shared` is the course's own helper folder, `shared/`, linked by npm workspaces. It's not on npm.
- It keeps the model choice in **`.env` only**, so switching provider never means editing lesson code.
- `chatModel()` builds the model object; `generateText` makes the call.
- `stripThinking()` removes a reasoning model's `<think>` block before you use the answer.
- `dump()` shows the **whole** returned object. `generateText` gives you far more than `text`: `finishReason`, `usage`, `response`, `steps` and more.
- Full details: **[the `@learn/shared` tour](../../shared/README.md)**.

---

← Previous: none, this is the first post · [📚 Series index](../README.md) · [Next: What is an LLM, and what is a token? →](../01-llm-and-tokens/README.md)
