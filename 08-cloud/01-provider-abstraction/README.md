# Post 01 · One interface, many providers: switching clouds is a `.env` change

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 1 of 8 · about 20 minutes*

> You built the triage assistant on Ollama on your laptop. Now IT says production runs on Azure, and next year the partner hospital wants it on AWS. If `import OpenAI from 'openai'` is sprinkled through 40 files, that's a rewrite. If it's one line in `.env`, it's an afternoon.

---

## The idea, in plain English

Every model vendor has its own SDK, request format, auth and quirks. The **AI SDK** hides that behind two interfaces: `LanguageModel` (chat) and `EmbeddingModel`. `generateText`, `Output.object`, tools, `embed`: all of it works the same whatever is behind the interface.

So the rule in this course is: **app code never imports a vendor SDK.** One small factory, [`shared/src/models.ts`](../../shared/src/models.ts), reads `.env` and returns the right model:

| `AI_PROVIDER` | `CHAT_MODEL` means | Also needs |
|---|---|---|
| `ollama` (default) | an Ollama model name | `OLLAMA_BASE_URL` (optional) |
| `azure` | your Azure **deployment** name | `AZURE_RESOURCE_NAME`, `AZURE_API_KEY` |
| `bedrock` | a Bedrock model or inference-profile id | `AWS_REGION` + AWS credentials |
| `openai-compatible` | whatever the server calls it | `OPENAI_COMPAT_BASE_URL` (vLLM, LM Studio, LiteLLM, Together, Groq…) |

App code just calls `chatModel()` and `embeddingModel()`. Switching provider changes configuration, not code.

Two things **do** change when you switch, and no abstraction hides them:

- **Behaviour.** A different model gives different answers. Re-run your evals (lesson 05) before switching.
- **Embeddings.** Each embedding model makes vectors of its own size and meaning. Vectors from one model can't be compared with another's, so **switching the embedding model means re-indexing** your documents (lesson 04).

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part A prints the configuration; part B makes one structured call and one embedding through whatever provider is active.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `embeddingModel()` returns the embedding model from `.env` (`EMBED_MODEL`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `modelLabel()` gives a printable label such as `ollama:<model>`; `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — what each provider needs

```ts
// What each provider needs from .env. Bedrock can also use AWS_PROFILE / SSO / an IAM role instead of keys.
const NEEDS: Record<string, string[]> = {
  ollama: ['OLLAMA_BASE_URL'],
  azure: ['AZURE_RESOURCE_NAME', 'AZURE_API_KEY'],
  bedrock: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  'openai-compatible': ['OPENAI_COMPAT_BASE_URL'],
};
```

### Step 2 — show the configuration, never the secrets

```ts
  // Never print secrets: show only whether they're set.
  console.log(`  ${name.padEnd(24)} ${v ? (/KEY|SECRET/.test(name) ? 'set (hidden)' : v) : '— not set'}`);
```

A "dry run" like this is the first thing to run after changing `.env` on a server: it shows what was picked up, without calling anything.

### Step 3 — the same code for every provider

```ts
  model: chatModel(), // ← the ONLY place a model appears, and it comes from .env
```

```ts
const { embedding } = await embed({ model: embeddingModel(), value: 'appointment cancellation policy' });
```

Nothing here mentions Ollama, Azure or AWS.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:01:offline   # configuration only, no network
npm run post:01           # + a structured call and an embedding
# or: npx tsx 01-provider-abstraction/example.ts
```

### What you should see

```
{ provider: 'ollama', chat: 'ollama:qwen3:0.6b', embed: 'ollama:qwen3-embedding:0.6b' }
  OLLAMA_BASE_URL          http://localhost:11434
{ department: 'general', urgent: false } { inputTokens: 39, outputTokens: 13, … }
dimensions=1024 (changes per provider → re-index your vector store when you switch!)
```

Yes: on the box, the tiny `qwen3:0.6b` said **crushing chest pain** is *general* and *not urgent*. The schema was valid; the judgement was wrong. Portability doesn't make a model good enough. Your evals decide that.

## Common gotchas

- ❌ **Importing a vendor SDK "just for this one feature".** It spreads. Keep vendor code in the factory.
- ❌ **Switching the embedding model without re-indexing.** Search quietly returns nonsense (or fails on vector size).
- ❌ **Assuming the same prompt works the same everywhere.** Run your eval suite against the new provider first.
- ❌ **Printing `.env` in logs.** Show "set (hidden)", never the value.
- ✅ Vendor-specific features (Azure content filters, Bedrock guardrails) are fine, but behind your own function, so they can be swapped too.

## Try it yourself

1. Fill in the Azure or Bedrock block in `.env` (even with fake values) and run `npm run post:01:offline`. Only configuration changed.
2. Point `AI_PROVIDER=openai-compatible` at Ollama's OpenAI-style endpoint (`OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1`) and run post 01 live.
3. Read [`shared/src/models.ts`](../../shared/src/models.ts). Where would you add Google Vertex AI (`@ai-sdk/google-vertex`)?

## Key takeaways

- App code depends on the AI SDK's `LanguageModel` / `EmbeddingModel`, **never on a vendor SDK**.
- One factory + `.env` picks the provider; switching is configuration.
- Switching still changes **behaviour** (re-run evals) and **embeddings** (re-index).

---

[← Previous: Lesson 07 — Observability & cost](../../07-observability/README.md) · [📚 Series index](../README.md) · [Next: Azure OpenAI: deployments and keyless auth →](../02-azure-openai/README.md)
