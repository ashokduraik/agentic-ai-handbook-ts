# Post 02 · Azure OpenAI: deployments, API versions and keyless auth

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 2 of 8 · about 25 minutes*

> IT has created an Azure OpenAI resource for the hospital and sent you a key in an email. Security replies: "No keys. Use managed identity." And your first call fails with `DeploymentNotFound`, although the model name is spelled exactly right.

---

## The idea, in plain English

**Azure OpenAI** (part of Azure AI Foundry) runs OpenAI models inside your Azure subscription: your region, your network rules, your compliance agreements. That's why hospitals and banks often choose it. Three things trip people up.

### 1. You call a *deployment*, not a model

In the Azure portal you **deploy** a model and give the deployment a name, such as `triage-prod`. Your code uses **that name** (`CHAT_MODEL=triage-prod`), not the model family. That's why "the right model name" gives `DeploymentNotFound`. Each deployment has its own quota, in **tokens per minute**; go over it and you get HTTP **429**. Lesson 06's retries and fallbacks, and this lesson's cache and routing, are your defence.

### 2. Two APIs

The AI SDK's Azure provider uses the newer **Responses API** by default (`azure('triage-prod')`). Some older deployments or regions only support **Chat Completions** (`azure.chat('triage-prod')`). If calls fail with a 404 on `/responses`, try the chat one; it's a one-line change in `shared/src/models.ts`.

### 3. Keys vs Entra ID

An API key is a password that never expires and is easy to leak. In production, use **Microsoft Entra ID** (formerly Azure AD) with a **managed identity**: Azure gives your app (App Service, Container Apps, AKS…) an identity, you grant it the *Cognitive Services OpenAI User* role on the resource, and the app fetches short-lived tokens. No secret to store or rotate. The provider supports this through a `tokenProvider` option.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part A uses a **fake fetch** that records the HTTP request instead of sending it, so you can see exactly what goes to Azure without an account.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — key auth, Responses API

```ts
// resourceName = the <name> in https://<name>.openai.azure.com. The model id you pass is your DEPLOYMENT name.
const azure = createAzure({ resourceName: 'contoso-health-ai', apiKey: 'demo-key-0000-not-real', fetch });
await generateText({ model: azure('triage-prod'), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
```

`fetch` is our recorder from [`support/fakes.ts`](../support/fakes.ts). Every AI SDK provider accepts a custom `fetch`, which is also how you'd add a corporate proxy or extra logging.

```ts
dump('request body (Responses API)', requests.at(-1)!.body);
```

[`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value) prints the whole JSON body that would go to Azure.

### Step 2 — the Chat Completions API

```ts
await generateText({ model: azure.chat('triage-prod'), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
```

```ts
dump('request body (Chat Completions)', requests.at(-1)!.body);
```

The same prompt, in the older API's shape.

### Step 3 — Entra ID instead of a key

```ts
// In production: import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
//   tokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')
// Here a fake token provider stands in, so you can see the header it produces.
const keyless = createAzure({ resourceName: 'contoso-health-ai', tokenProvider: async () => 'eyJ0eXAiOiJKV1QiLCJhbGciOi.fake', fetch });
```

`DefaultAzureCredential` tries, in order, environment variables, a managed identity, and your `az login` session, so the same code works on your laptop and in Azure.

### Step 4 — a real call, only on Azure

```ts
  const result = await generateText({ model: chatModel(), prompt: 'In one sentence: what is triage?', maxOutputTokens: 200 });
```

```ts
  console.log('response.modelId:', result.response.modelId, '  steps[0].model.provider:', result.steps[0]!.model.provider);
```

The real call goes through the same `chatModel()` as everything else, and its result has the same fields as on Ollama, so we don't dump it ([all the fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)). We log only the Azure-specific parts.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:02:offline   # part A: captured requests, no account needed
npm run post:02           # + part B when AI_PROVIDER=azure
# or: npx tsx 02-azure-openai/example.ts
```

For part B, in the repo-root `.env`:

```env
AI_PROVIDER=azure
AZURE_RESOURCE_NAME=my-openai-resource      # https://<this>.openai.azure.com
AZURE_API_KEY=...
CHAT_MODEL=<your chat DEPLOYMENT name>
EMBED_MODEL=<your embedding DEPLOYMENT name>
```

### What you should see

Real output of part A (it's the same on every run):

```
── [A1] Key auth, Responses API (the default) ──────────────────
{
  url: 'https://contoso-health-ai.openai.azure.com/openai/v1/responses?api-version=v1',
  auth: 'api-key: demo-key-000…',
  'body.model': 'triage-prod'
}
▼ request body (Responses API)
{
  model: 'triage-prod',
  input: [
    { role: 'user', content: [ { type: 'input_text', text: 'Hello' } ] }
  ]
}

── [A2] Chat Completions API (older deployments and some regions) 
{
  url: 'https://contoso-health-ai.openai.azure.com/openai/v1/chat/completions?api-version=v1',
  auth: 'api-key: demo-key-000…',
  'body.model': 'triage-prod'
}
▼ request body (Chat Completions)
{ model: 'triage-prod', messages: [ { role: 'user', content: 'Hello' } ] }

── [A3] Entra ID (managed identity): a token instead of a key ──
{
  url: 'https://contoso-health-ai.openai.azure.com/openai/v1/responses?api-version=v1',
  auth: 'authorization: Bearer eyJ0e…',
  'body.model': 'triage-prod'
}

[B] skipped: AI_PROVIDER is "ollama". Set AI_PROVIDER=azure and AZURE_* in .env to call Azure for real.
```

| Field | What it means |
| --- | --- |
| `model` | Your **deployment** name, not a model family. |
| `input` (Responses API) | The prompt as a list of messages; each message's `content` is a list of typed parts (`input_text`). |
| `messages` (Chat Completions) | The same prompt in the older shape: `content` is a plain string. |

Part B (only with `AI_PROVIDER=azure`) prints the `response.modelId` / `steps[0].model.provider` line, then the answer and its usage. *Illustrative, not run:* expect `response.modelId` to name the model behind your deployment and `steps[0].model.provider` to be `azure.responses` (that value was checked offline, on the provider object).

Part A was verified on the box. **Part B (a real Azure call) and the Entra ID setup were not tested**: no Azure account was available. Check the AI SDK Azure provider docs if anything has changed.

## Common gotchas

- ❌ **Model family name instead of deployment name** → `DeploymentNotFound` (404).
- ❌ **A 404 on `/responses`** → the deployment or region doesn't support the Responses API yet; use `azure.chat(...)`.
- ❌ **Keys in production.** Use a managed identity and the *Cognitive Services OpenAI User* role.
- ❌ **Ignoring 429s.** Quota is per deployment, in tokens per minute. Retry with backoff, cache, and route light traffic elsewhere.
- ❌ **Assuming content filters are off.** Azure filters prompts and answers by default; a blocked request comes back as an error, which can surprise medical apps. Handle it explicitly.
- ✅ Same code, same evals: only `.env` and auth differ.

## Try it yourself

1. Change `resourceName` to your own resource and look at the URL. Then try `baseURL` instead (for private endpoints).
2. Add `apiVersion` to `createAzure` and see how the URL changes.
3. With an Azure account: deploy a small model, set `.env`, run `npm run post:01` and `npm run post:02`. Then switch `chatModel` in `shared/src/models.ts` to use `tokenProvider` (you'll need `npm install @azure/identity`).

## Key takeaways

- On Azure you call **deployments**; each has its own tokens-per-minute quota.
- Responses API by default; `azure.chat()` for Chat Completions.
- **Entra ID + managed identity** in production, through `tokenProvider`. No keys.
- A custom `fetch` shows exactly what goes over the wire.

---

[← Previous: One interface, many providers](../01-provider-abstraction/README.md) · [📚 Series index](../README.md) · [Next: Amazon Bedrock: model access and the credential chain →](../03-amazon-bedrock/README.md)
