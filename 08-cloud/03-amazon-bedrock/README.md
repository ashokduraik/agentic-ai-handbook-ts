# Post 03 · Amazon Bedrock: model access, inference profiles and the credential chain

*Series: [Lesson 08 — Cloud providers & the gateway](../README.md) · Post 3 of 8 · about 25 minutes*

> The partner hospital runs on AWS. Your first Bedrock call fails with `AccessDeniedException`. You enable the model; now it's `ValidationException: on-demand throughput isn't supported`. And the AWS team won't give you long-lived access keys.

---

## The idea, in plain English

**Amazon Bedrock** gives you many vendors' models behind one AWS API, billed through your AWS account and governed by IAM. Three ideas matter.

### 1. Model access and IAM

Bedrock models must be **available to your account in that region**; check *Model access* / the model catalog in the Bedrock console. Your app's IAM role needs `bedrock:InvokeModel` (plus `bedrock:InvokeModelWithResponseStream` for streaming) on the model or profile.

### 2. Inference profiles

Many newer models can only be called through a **cross-region inference profile**: an id with a prefix such as `us.`, `eu.` or `global.`. Bedrock then serves the request from any region in that group, which gives more capacity. If you see "on-demand throughput isn't supported", use the profile id as `CHAT_MODEL`. (For data-residency rules, pick the profile whose regions you're allowed to use: `eu.` keeps EU traffic in the EU.)

### 3. The credential chain

AWS requests are **signed** (Signature Version 4) with credentials. Where do they come from? The AWS **default credential chain** tries, in order: environment variables, your `~/.aws` profile or SSO login, then the role of the machine you run on (ECS task role, EKS pod identity / IRSA, EC2 instance profile). In production you use a **role**: short-lived credentials, no keys in files. The AI SDK's Bedrock provider takes a `credentialProvider` function for this.

---

## Let's see it in code

Open [`example.ts`](./example.ts). As in post 02, a fake `fetch` records the request instead of sending it.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — an inference profile id

```ts
// A cross-region INFERENCE PROFILE id: the "eu." prefix lets Bedrock serve it from several EU regions.
// (A made-up id: use one from your Bedrock console → Model catalog / Inference profiles.)
const MODEL_ID = 'eu.example-vendor.example-model-v1:0';
```

### Step 2 — static keys produce a signed request

```ts
const bedrock = createAmazonBedrock({
  region: 'eu-central-1',
  accessKeyId: 'AKIAEXAMPLEEXAMPLE00', // fake: never put real keys in code
  secretAccessKey: 'fake-secret',
  fetch,
});
```

The output shows the region-specific URL, the model id, the `/converse` API (Bedrock's common chat format across vendors), and an `AWS4-HMAC-SHA256` signature header.

```ts
dump('request body (Converse API)', r.body);
```

[`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value) then prints the whole JSON body that would go to Bedrock.

### Step 3 — a credential provider

```ts
// In production: import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
//   credentialProvider: fromNodeProviderChain()   ← env vars, ~/.aws profile/SSO, ECS/EKS/EC2 roles, in that order
// Here a fake provider returns short-lived credentials, like an assumed role would.
const viaRole = createAmazonBedrock({
  region: 'eu-central-1',
  credentialProvider: async () => ({ accessKeyId: 'ASIATEMPORARYEXAMPLE', secretAccessKey: 'fake', sessionToken: 'fake-session-token' }),
  fetch,
});
```

Temporary credentials come with a **session token**, which you can see in the `x-amz-security-token` header.

### Step 4 — a real call, only on Bedrock

```ts
  const result = await generateText({ model: chatModel(), prompt: 'In one sentence: what is triage?', maxOutputTokens: 200 });
```

```ts
  console.log('response.modelId:', result.response.modelId, '  steps[0].model.provider:', result.steps[0]!.model.provider);
```

The same `chatModel()` as everywhere else, and a result with the same fields as on Ollama, so we don't dump it ([all the fields](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)). We log only the Bedrock-specific parts.

---

## Run it

From the lesson folder (`08-cloud/`):

```bash
npm run post:03:offline   # part A: captured requests, no account needed
npm run post:03           # + part B when AI_PROVIDER=bedrock
# or: npx tsx 03-amazon-bedrock/example.ts
```

For part B, in the repo-root `.env`:

```env
AI_PROVIDER=bedrock
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...        # or leave these out and use AWS_PROFILE / SSO / a role (see Try it yourself)
AWS_SECRET_ACCESS_KEY=...
CHAT_MODEL=<model id or inference-profile id>
EMBED_MODEL=<Bedrock embedding model id>
```

### What you should see

Real output of part A (the date and `x-amz-date` change with the clock):

```
── [A1] Static keys → a SigV4-signed request ───────────────────
{
  url: 'https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.example-vendor.example-model-v1%3A0/converse',
  authorization: 'AWS4-HMAC-SHA256 Credential=AKIAEXAMPLEEXAMPLE00/20261024/eu-central-1/bedrock/aws4_request',
  'x-amz-date': '20261024T155836Z'
}
▼ request body (Converse API)
{
  system: [],
  messages: [
    { role: 'user', content: [ { text: 'Hello' } ] }
  ]
}

── [A2] A credential provider (SSO, profiles, IAM roles) ───────
{
  authorization: 'AWS4-HMAC-SHA256 Credential=ASIATEMPORARYEXAMPLE/20261024/eu-central-1/bedrock/aws4_request',
  'x-amz-security-token': 'fake-session…'
}

[B] skipped: AI_PROVIDER is "ollama". Set AI_PROVIDER=bedrock, AWS_REGION and credentials in .env to call Bedrock for real.
```

In the body, notice there is **no model id**: it's in the URL. `system` is empty because there are no instructions, and each message's `content` is a list of blocks (`{ text }`). Part B prints the `response.modelId` / `steps[0].model.provider` line, then the answer and its usage. *Illustrative, not run:* expect `steps[0].model.provider` to be `amazon-bedrock` (that value was checked offline, on the provider object).

Part A was verified on the box. **Part B (a real Bedrock call) was not tested**: no AWS account was available.

## Common gotchas

- ❌ **`AccessDeniedException`** → model access isn't enabled in that region, or the IAM role lacks `bedrock:InvokeModel`.
- ❌ **"on-demand throughput isn't supported"** → use an inference-profile id (`us.`, `eu.`, `global.` prefix).
- ❌ **Static keys in `.env` on servers.** Use roles and `fromNodeProviderChain()`.
- ❌ **Wrong region.** The model, the profile and `AWS_REGION` must match.
- ❌ **Assuming every model supports tools or structured output** through Converse. Check the model's features; run your evals.
- ✅ Bedrock **Guardrails** (content filters, PII masking) can be added by config; keep them behind your own function too.

## Try it yourself

1. Change the region and the profile prefix and look at the URL.
2. With an AWS account: `npm install @aws-sdk/credential-providers`, change the Bedrock case in `shared/src/models.ts` to pass `credentialProvider: fromNodeProviderChain()`, run `aws sso login`, and remove the keys from `.env`.
3. Write the IAM policy that allows only one inference profile.

## Key takeaways

- Enable **model access** per region, and grant `bedrock:InvokeModel`.
- Use **inference-profile ids** for many newer models; choose the prefix for your data rules.
- Requests are **SigV4-signed**; in production, credentials come from a **role** via the credential chain.

---

[← Previous: Azure OpenAI: deployments and keyless auth](../02-azure-openai/README.md) · [📚 Series index](../README.md) · [Next: Model aliases →](../04-model-aliases/README.md)
