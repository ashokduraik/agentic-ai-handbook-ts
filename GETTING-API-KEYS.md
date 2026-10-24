# Getting API keys for each LLM provider

**[🏠 Course home](README.md)** · [The course toolkit (`shared/`)](shared/README.md) · [Lesson 08: cloud providers](08-cloud/README.md)

This guide shows, step by step, how to get the credentials each provider needs and how to put them in your `.env` file. You only need **one** provider to run the course. Ollama on your own machine needs no key at all, so start there and add a cloud provider when you want to try one.

*Written in October 2026 from the official docs linked below. Consoles, free tiers and model names change often, so if a screen looks different, follow the linked doc page. Where this guide could not confirm an exact menu path, it describes the step in general words and links the doc.*

---

## Contents

1. [Summary table](#1-summary-table)
2. [How `.env` picks a provider](#2-how-env-picks-a-provider)
3. [Ollama (local, no key)](#3-ollama-local-no-key)
4. [Azure OpenAI / Microsoft Foundry](#4-azure-openai--microsoft-foundry)
5. [Amazon Bedrock](#5-amazon-bedrock)
6. [Hosted APIs through `openai-compatible`](#6-hosted-apis-through-openai-compatible)
   - [OpenAI](#61-openai) · [Groq](#62-groq) · [OpenRouter](#63-openrouter) · [Google Gemini](#64-google-gemini) · [Together AI](#65-together-ai) · [Local servers: LM Studio, vLLM](#66-local-openai-compatible-servers-lm-studio-vllm)
7. [Embeddings: one provider for both chat and embeddings](#7-embeddings-one-provider-for-both-chat-and-embeddings)
8. [Test that it works](#8-test-that-it-works)
9. [Security notes](#9-security-notes)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Summary table

| Provider | `AI_PROVIDER` | Env vars you set | Cost / free tier (Oct 2026, changes often) | Official link |
|---|---|---|---|---|
| **Ollama** (your machine) | `ollama` | `OLLAMA_BASE_URL` (optional), `CHAT_MODEL`, `EMBED_MODEL` | Free. Runs on your hardware. | [docs.ollama.com](https://docs.ollama.com/quickstart) |
| **Azure OpenAI / Foundry** | `azure` | `AZURE_RESOURCE_NAME`, `AZURE_API_KEY`, `CHAT_MODEL`, `EMBED_MODEL` (both are **deployment names**) | Pay as you go. New Azure accounts get a $200 credit for 30 days. | [Create a resource](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/create-resource) |
| **Amazon Bedrock** | `bedrock` | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (or `AWS_BEARER_TOKEN_BEDROCK`), `CHAT_MODEL`, `EMBED_MODEL` | Pay per token. See AWS pricing. | [Model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) |
| **OpenAI** | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1`, `OPENAI_COMPAT_API_KEY`, `CHAT_MODEL`, `EMBED_MODEL` | Pay as you go: you add credits on the billing page. | [Quickstart](https://platform.openai.com/docs/quickstart) |
| **Groq** | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_COMPAT_API_KEY`, `CHAT_MODEL` | Free plan with low rate limits; paid Developer plan. **No embedding model listed.** | [OpenAI compatibility](https://console.groq.com/docs/openai) |
| **OpenRouter** | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1`, `OPENAI_COMPAT_API_KEY`, `CHAT_MODEL`, `EMBED_MODEL` | Pay with credits; some `:free` models with daily request limits. | [Quickstart](https://openrouter.ai/docs/quickstart) |
| **Google Gemini** | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `OPENAI_COMPAT_API_KEY`, `CHAT_MODEL`, `EMBED_MODEL` | Free tier for some models, with limits; paid tier. | [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) |
| **Together AI** | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=https://api.together.ai/v1`, `OPENAI_COMPAT_API_KEY`, `CHAT_MODEL` | Paid (credits). **No serverless embedding models** right now. | [OpenAI compatibility](https://docs.together.ai/docs/openai-api-compatibility) |
| **LM Studio / vLLM** (your machine) | `openai-compatible` | `OPENAI_COMPAT_BASE_URL=http://localhost:1234/v1` (LM Studio) or `http://localhost:8000/v1` (vLLM), `CHAT_MODEL`, `EMBED_MODEL` | Free. No key. | [LM Studio](https://lmstudio.ai/docs/developer/openai-compat) · [vLLM](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html) |

---

## 2. How `.env` picks a provider

Before the steps, it helps to know exactly what the course code reads. Everything happens in two small files in [`shared/`](shared/README.md):

- [`shared/src/env.ts`](shared/src/env.ts) loads the `.env` file at the **repo root** (`agentic-ai-handbook-ts/.env`).
- [`shared/src/models.ts`](shared/src/models.ts) looks at `AI_PROVIDER` and builds the right model for `chatModel()` and `embeddingModel()`.

| `AI_PROVIDER` | What the code reads | Notes |
|---|---|---|
| `ollama` (default) | `OLLAMA_BASE_URL` (default `http://localhost:11434`) | No key. |
| `azure` | `AZURE_RESOURCE_NAME`, `AZURE_API_KEY` (both **required**) | `CHAT_MODEL` / `EMBED_MODEL` are your **deployment names**. |
| `bedrock` | `AWS_REGION` (default `us-east-1`) plus the standard AWS variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, **or** `AWS_BEARER_TOKEN_BEDROCK` | The Bedrock provider reads these from the environment by itself. |
| `openai-compatible` | `OPENAI_COMPAT_BASE_URL` (**required**), `OPENAI_COMPAT_API_KEY` (optional, so local servers work without one) | One base URL for chat **and** embeddings. |

Two rules apply to every provider:

1. `CHAT_MODEL` and `EMBED_MODEL` are always required. `FALLBACK_MODEL` and `JUDGE_MODEL` are optional and use the same provider.
2. **One provider at a time.** `AI_PROVIDER` is used for both chat and embeddings. More on what this means in [section 7](#7-embeddings-one-provider-for-both-chat-and-embeddings).

> **Tip:** a value that starts with `<` (like `<your-chat-model>` in `.env.example`) counts as "not set". The code then stops with a clear "Missing env var" message instead of sending a bad request.

To switch providers, edit `.env` only. No code changes are needed. Keep the lines for the other providers in the file if you like; only the ones for the active `AI_PROVIDER` are used.

---

## 3. Ollama (local, no key)

Ollama runs open models on your own computer. Nothing leaves your machine, and there is nothing to pay or sign up for.

**Step 1 — Install Ollama.** Download it for macOS, Windows or Linux from [ollama.com/download](https://ollama.com/download), then open the app. See the [Ollama quickstart](https://docs.ollama.com/quickstart).

**Step 2 — Pull a chat model and an embedding model.** The chat model should support **tool calling** (look for the "tools" tag on its page in the [Ollama library](https://ollama.com/library)).

```bash
ollama pull qwen3.8:latest          # chat model (the one you already use)
ollama pull qwen3-embedding:4b      # embedding model
ollama list                         # shows the exact names to put in .env
```

**Step 3 — Fill `.env`.**

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
CHAT_MODEL=qwen3.8:latest
EMBED_MODEL=qwen3-embedding:4b
```

`OLLAMA_BASE_URL` is the address of the Ollama server. Leave it as `http://localhost:11434` unless Ollama runs on another machine. Don't add `/api` or `/v1`: the code adds `/api` itself.

**Step 4 — Check it.** From the repo root:

```bash
npm run check:ollama     # is Ollama reachable, and are both models pulled?
```

---

## 4. Azure OpenAI / Microsoft Foundry

Azure OpenAI runs OpenAI models inside an Azure subscription. Microsoft now presents it as part of **Microsoft Foundry** (earlier called Azure AI Foundry), so you'll see both names in the docs. Many hospitals and banks choose it for data residency and compliance agreements.

### The one idea to understand first: deployments

On Azure you don't call a model by its family name. You **deploy** a model and give the deployment a name, and your code calls **that name**. Microsoft's docs say it plainly: *"Azure OpenAI always requires deployment name, even when using the model parameter."* ([source](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/create-resource))

So in `.env`, `CHAT_MODEL` and `EMBED_MODEL` are **your deployment names**, for example `chat-main` and `embed-main`, not `gpt-…` model ids. (You may name a deployment the same as its model; many people do.)

### Step 1 — Create an Azure account

1. Go to [Try Azure for free](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account) and sign up. You need a phone number and a card. Microsoft says there may be a temporary $1 authorization on the card, reversed afterwards.
2. New customers get a **$200 credit to use within 30 days**. After that, or once the credit is used up, you move to pay-as-you-go to continue.

*Not verified:* whether every model has quota on a free-trial subscription. If a model shows no available quota on the trial, upgrading the subscription to pay-as-you-go is the usual fix. Check the [quota doc](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/quota).

### Step 2 — Create the resource

Follow Microsoft's guide: [Create and deploy an Azure OpenAI resource](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/create-resource). In short:

1. Sign in to the [Azure portal](https://portal.azure.com).
2. Choose **Create a resource**, search for **Azure OpenAI**, then choose **Create**. (A newer **Foundry** resource type also gives you Azure OpenAI through the same kind of endpoint and key; see [Create a Foundry resource](https://learn.microsoft.com/en-us/azure/ai-services/multi-service-resource). Either works for this course.)
3. On the **Basics** tab fill in:
   - **Subscription** and **Resource group** (create a new group, e.g. `rg-learning`).
   - **Region**: pick one that offers the models you want. See [model region availability](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models). Azure has India regions (such as Central India and South India), but not every model is in every region, so check the table first.
   - **Name**: this becomes your **resource name**, for example `ashok-learning-ai`. Write it down.
   - **Pricing tier**: Standard.
4. Keep the default network option (all networks) for learning, then **Review + submit** → **Create** → **Go to resource**.

Prefer the command line? The same guide shows `az cognitiveservices account create …` with the Azure CLI.

### Step 3 — Deploy a chat model and an embedding model

1. Open your resource in the Foundry portal ([ai.azure.com](https://ai.azure.com)) and go to the deployments page (**Deployments**, or **Models + endpoints** on a Foundry resource).
2. Choose **Deploy model** → **Deploy base model**, pick a **chat model** that supports tool calling, and confirm.
3. Set the **Deployment name** (for example `chat-main`). This is what goes into `CHAT_MODEL`.
4. **Deployment type**: *Global Standard* or *Standard* is fine for learning. See [deployment types](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types).
5. Under the advanced settings you can set the **Tokens per Minute (TPM) rate limit**. This is your quota for that deployment.
6. Choose **Deploy** and wait until the provisioning state is *Succeeded*.
7. Repeat for an **embedding model** (for example a `text-embedding-3-small` deployment named `embed-main`). This goes into `EMBED_MODEL`.

The Microsoft guide also shows the CLI version (`az cognitiveservices account deployment create …`). Menu names in the Foundry portal have changed more than once; if yours differ, follow the [guide](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/create-resource).

### Step 4 — Copy the key and the resource name

1. In the Azure portal, open your resource and go to **Resource Management → Keys and Endpoint**.
2. Copy **KEY 1** → that's `AZURE_API_KEY`. (There are two keys so you can rotate one while the other keeps working.)
3. Look at the **Endpoint**, for example `https://ashok-learning-ai.openai.azure.com/`. The part before `.openai.azure.com` is `AZURE_RESOURCE_NAME` → `ashok-learning-ai`. Put only the name in `.env`, not the full URL.

CLI alternative: `az cognitiveservices account keys list --name <resource> --resource-group <group>`.

### Step 5 — Fill `.env`

```env
AI_PROVIDER=azure
AZURE_RESOURCE_NAME=ashok-learning-ai        # from https://<this>.openai.azure.com
AZURE_API_KEY=<paste KEY 1 here>
CHAT_MODEL=chat-main                         # your chat DEPLOYMENT name
EMBED_MODEL=embed-main                       # your embedding DEPLOYMENT name
# FALLBACK_MODEL=chat-mini                   # optional: another deployment
```

With these values the code calls `https://<AZURE_RESOURCE_NAME>.openai.azure.com/openai/v1/…` and uses the **Responses API** by default. If your deployment returns a 404 on `/responses`, read [lesson 08, post 02](08-cloud/02-azure-openai/README.md), which shows the one-line switch to Chat Completions.

### Quota and limits in plain words

- Quota is set **per deployment, per region**, in tokens per minute (TPM). Go over it and you get **HTTP 429**.
- You can view and change it under **Quotas** in the Foundry portal. See [Manage quota](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/quota).
- Azure applies **content filters** by default. A blocked prompt or answer comes back as an error, which can surprise medical apps.
- For production, use **Microsoft Entra ID** (keyless) instead of keys. [Lesson 08, post 02](08-cloud/02-azure-openai/README.md) explains how.

---

## 5. Amazon Bedrock

Bedrock gives you models from Amazon, Anthropic, Meta, Mistral, OpenAI (open-weight), Qwen and others through one AWS API.

### What changed about "model access" (important)

The old step of going to **Model access** and requesting each model is gone in commercial regions. According to the [model access doc](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html):

- Access to most models is **enabled by default**. You pick a model in the **Model catalog** and call it. On the first call, Bedrock starts any AWS Marketplace subscription it needs in the background.
- For that automatic first-time setup, the identity that makes the first call needs the Marketplace permissions `aws-marketplace:Subscribe`, `aws-marketplace:Unsubscribe` and `aws-marketplace:ViewSubscriptions`, and the account needs a valid payment method. This only applies to models sold through AWS Marketplace. **Amazon's own models (Nova, Titan) and OpenAI's gpt-oss models don't need it.**
- **Anthropic (Claude) models** need a one-time **use-case form** first. You can submit it from the model catalog by opening a Claude model, or on the Anthropic provider page. An individual developer can give a GitHub or portfolio URL as the website.
- The old **Model access** page now only applies to AWS GovCloud.

**The easiest start** is therefore an Amazon model such as **Amazon Nova 2 Lite** for chat and **Titan Text Embeddings V2** for embeddings: no form and no Marketplace step.

### Step 1 — Create an AWS account

Sign up at [aws.amazon.com](https://aws.amazon.com/). Then follow AWS's advice: don't use the root user day to day. Turn on MFA for root and create an admin identity for yourself. See [Bedrock getting started](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html).

**Set a budget now** (see [section 9](#9-security-notes)). Bedrock bills per token from the first call.

### Step 2 — Pick a region

Bedrock is regional, and each model is available in some regions only. `us-east-1` (N. Virginia) and `us-west-2` (Oregon) have the widest choice. Asia Pacific (Mumbai) is `ap-south-1`. Check each model's card in [Supported foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) for its regions. Whatever you choose goes in `AWS_REGION`. If you leave it empty, the code uses `us-east-1`.

### Step 3 — Choose model IDs (and understand inference profiles)

Bedrock has two kinds of IDs you can put in `CHAT_MODEL`:

- **Model ID**, e.g. `amazon.nova-2-lite-v1:0`: calls the model in your region.
- **Inference profile ID**, e.g. `us.amazon.nova-2-lite-v1:0` or `global.amazon.nova-2-lite-v1:0`: the prefix (`us.`, `eu.`, `jp.`, `global.` …) means Bedrock may route your request to another region in that group to give you more capacity. Many newer models can **only** be called through an inference profile, and calling the plain model ID then fails. See [inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html) and the [supported profiles list](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html).

The model card shows which IDs are valid. For example the [Nova 2 Lite card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html) lists `amazon.nova-2-lite-v1:0`, `us.amazon.nova-2-lite-v1:0`, `eu.…`, `jp.…` and `global.amazon.nova-2-lite-v1:0`.

For embeddings, Titan Text Embeddings V2 is `amazon.titan-embed-text-v2:0` ([doc](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)).

### Step 4 — Create credentials with least privilege

The course code uses the AWS environment variables. You have two options; **option A** matches `.env.example`.

> **Note:** the Bedrock provider used here reads credentials **from environment variables only** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, or `AWS_BEARER_TOKEN_BEDROCK`). It does not read `~/.aws/credentials` profiles by itself, so `aws configure` alone is not enough; put the values in `.env`.

#### Option A — an IAM user with an access key (works with the code as is)

1. Open the [IAM console](https://console.aws.amazon.com/iam/) → **Users** → **Create user**, e.g. `bedrock-learning`. Don't give it console access.
2. Attach a **small custom policy** instead of a broad one. This one only lets the user call models:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "InvokeBedrockModels",
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:InvokeModelWithResponseStream"
         ],
         "Resource": [
           "arn:aws:bedrock:*::foundation-model/*",
           "arn:aws:bedrock:*:*:inference-profile/*"
         ]
       }
     ]
   }
   ```

   `bedrock:InvokeModel` covers normal calls and `InvokeModelWithResponseStream` covers streaming. The inference-profile line is needed when `CHAT_MODEL` starts with `us.`, `global.` and so on. To be stricter, replace the `*` with the exact model and profile ARNs you use. If you also want to try Marketplace models (e.g. some third-party ones), make the very first call with an identity that has the three `aws-marketplace:*` permissions listed above, or add them temporarily. AWS also offers a managed policy, `AmazonBedrockLimitedAccess`, which is broader. See [Bedrock identity-based policies](https://docs.aws.amazon.com/bedrock/latest/userguide/security_iam_id-based-policy-examples.html).
3. Open the user → **Security credentials** → **Create access key**, choose the local-code use case, and copy the **Access key ID** and **Secret access key**. The secret is shown **only once**. See [Managing access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).

```env
AI_PROVIDER=bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your access key id, starts with AKIA>
AWS_SECRET_ACCESS_KEY=<your secret access key>
# AWS_SESSION_TOKEN=<only if you use temporary credentials, e.g. from SSO>
CHAT_MODEL=us.amazon.nova-2-lite-v1:0
EMBED_MODEL=amazon.titan-embed-text-v2:0
```

A long-lived access key is fine for learning on your laptop. AWS recommends short-lived credentials (IAM Identity Center / SSO, or roles) for anything real. If you use SSO, copy the temporary `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` into `.env`; they expire after a few hours.

#### Option B — a Bedrock API key (also works with the code as is)

Bedrock now also has **API keys** (a bearer token). The installed AI SDK Bedrock provider reads the `AWS_BEARER_TOKEN_BEDROCK` environment variable automatically and then sends the key instead of signing with access keys. This was checked in the installed package code and the [AI SDK Bedrock docs](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock); it was **not** tested against a real AWS account.

1. Open the [Bedrock console](https://console.aws.amazon.com/bedrock/) in your chosen region → **API keys**.
2. **Short-term** key: lasts up to 12 hours (or your console session) and has your own permissions. AWS recommends this one. **Long-term** key: you choose an expiry; AWS creates an IAM user behind it, and recommends it for exploration only.
3. A key works only in the region it was generated in.

```env
AI_PROVIDER=bedrock
AWS_REGION=us-east-1                         # the region the key was made in
AWS_BEARER_TOKEN_BEDROCK=<your Bedrock API key>
CHAT_MODEL=us.amazon.nova-2-lite-v1:0
EMBED_MODEL=amazon.titan-embed-text-v2:0
```

If `AWS_BEARER_TOKEN_BEDROCK` is set, it wins over the access-key variables. Details: [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).

---

## 6. Hosted APIs through `openai-compatible`

Many providers accept the same HTTP API as OpenAI. The course's `openai-compatible` option works with all of them: you only change the **base URL**, the **key**, and the **model names**.

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=<provider base URL, ending in /v1 or similar>
OPENAI_COMPAT_API_KEY=<provider key>
CHAT_MODEL=<a model id from that provider>
EMBED_MODEL=<an embedding model id from that provider>
```

Things to know before you start:

- The code calls `<base URL>/chat/completions` for chat and `<base URL>/embeddings` for embeddings. Use the base URL exactly as shown below, without a trailing `/chat/completions`.
- Pick a chat model that supports **tool calling**; lessons 02, 03, 06 and 10 need it.
- The code asks for **strict JSON-schema structured output** (`supportsStructuredOutputs: true`). Most big providers support it, but some smaller models don't and return a 400 error on lesson 01 post 07. Then try another model.
- Model names below are examples from each provider's docs in October 2026. They change often, so check the provider's model list.

### 6.1 OpenAI

1. Sign up at [platform.openai.com](https://platform.openai.com/).
2. Add a payment method and buy credits on the [billing page](https://platform.openai.com/settings/organization/billing/overview). OpenAI's API is pay-as-you-go; don't count on free credits.
3. Create a key on the [API keys page](https://platform.openai.com/api-keys). Copy it straight away; it's shown once. A **project** key is a good idea, so you can set limits per project.
4. Set a monthly budget and alert under the billing / limits settings.

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_API_KEY=<sk-... your OpenAI key>
CHAT_MODEL=<a current chat model, e.g. the one in the quickstart>
EMBED_MODEL=text-embedding-3-small
```

Docs: [Quickstart](https://platform.openai.com/docs/quickstart) · [Models](https://platform.openai.com/docs/models) · [Embeddings](https://platform.openai.com/docs/guides/embeddings) · [Pricing](https://openai.com/api/pricing/).

### 6.2 Groq

Groq runs open models (gpt-oss, Llama, Qwen …) very fast.

1. Sign up at [console.groq.com](https://console.groq.com/).
2. Create a key on the [API keys page](https://console.groq.com/keys).
3. Groq has a **free plan** with low rate limits and a paid **Developer** plan with higher ones. See [rate limits](https://console.groq.com/docs/rate-limits).

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://api.groq.com/openai/v1
OPENAI_COMPAT_API_KEY=<gsk_... your Groq key>
CHAT_MODEL=openai/gpt-oss-20b
EMBED_MODEL=<none on Groq — see section 7>
```

**Embeddings:** Groq's [model list](https://console.groq.com/docs/models) shows no embedding model in October 2026. So with Groq you can run the chat-only lessons, but not the ones that embed text (04, 05, 07, 09, 10, and lesson 01 post 06). See [section 7](#7-embeddings-one-provider-for-both-chat-and-embeddings).

Docs: [OpenAI compatibility](https://console.groq.com/docs/openai) (lists the few OpenAI fields Groq doesn't support).

### 6.3 OpenRouter

OpenRouter is a single API in front of hundreds of models from many vendors. It's handy for trying different models with one key.

1. Sign up at [openrouter.ai](https://openrouter.ai/).
2. Create a key on the [keys page](https://openrouter.ai/settings/keys). You can give each key a **credit limit**, which is a nice safety net.
3. Buy credits for paid models. Models whose id ends in `:free` cost nothing but have their own rate limits. The daily limit depends on whether you've bought credits. See the [FAQ](https://openrouter.ai/docs/faq).

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1
OPENAI_COMPAT_API_KEY=<sk-or-... your OpenRouter key>
CHAT_MODEL=<a model slug from openrouter.ai/models, e.g. openai/gpt-oss-20b>
EMBED_MODEL=openai/text-embedding-3-small
```

OpenRouter has an [embeddings API](https://openrouter.ai/docs/api/reference/embeddings); its examples use `openai/text-embedding-3-small` and `qwen/qwen3-embedding-0.6b`.

Docs: [Quickstart](https://openrouter.ai/docs/quickstart) · [Authentication](https://openrouter.ai/docs/api/reference/authentication) · [Models](https://openrouter.ai/models).

### 6.4 Google Gemini

Gemini has its own API, but it also offers an **OpenAI-compatible endpoint**, which is what this course uses.

1. Sign in with a Google account at [Google AI Studio](https://aistudio.google.com/).
2. Create a key on the [API key page](https://aistudio.google.com/apikey). Read [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key).
3. There is a **free tier** for some models, with rate limits. Google notes that some models aren't on the free tier. On the free tier your data may be used to improve Google's products, so read the terms and **never send patient data on the free tier**. See [pricing](https://ai.google.dev/gemini-api/docs/pricing).

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_COMPAT_API_KEY=<your Gemini API key>
CHAT_MODEL=gemini-3.8-flash
EMBED_MODEL=gemini-embedding-001
```

The [OpenAI compatibility page](https://ai.google.dev/gemini-api/docs/openai) shows chat, function calling, structured output and embeddings (`gemini-embedding-001` for text). Google says this compatibility layer is still in **beta**.

### 6.5 Together AI

Together hosts many open models.

1. Sign up at [together.ai](https://www.together.ai/) and create a key in the account settings (API keys).
2. Add credits; see [billing and credits](https://docs.together.ai/docs/billing-credits). *Not verified:* whether new accounts get any free credit in October 2026.

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://api.together.ai/v1
OPENAI_COMPAT_API_KEY=<your Together key>
CHAT_MODEL=<a model id from Together's serverless models page>
EMBED_MODEL=<none serverless right now — see section 7>
```

Together's [serverless models page](https://docs.together.ai/docs/serverless-models) says: *"There are currently no embedding models offered via serverless."* So treat it like Groq for embeddings. Docs: [OpenAI compatibility](https://docs.together.ai/docs/openai-api-compatibility).

### 6.6 Local OpenAI-compatible servers (LM Studio, vLLM)

These run models on your own machine, like Ollama, and need **no key**. Leave `OPENAI_COMPAT_API_KEY` empty.

- **LM Studio** (desktop app): load a model, start the local server, and use `http://localhost:1234/v1`. See [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat).
- **vLLM** (Linux + NVIDIA GPU, for serving): `vllm serve <model>` listens on `http://localhost:8000/v1` by default. See [vLLM's OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html).

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=http://localhost:1234/v1     # LM Studio; vLLM: http://localhost:8000/v1
OPENAI_COMPAT_API_KEY=
CHAT_MODEL=<the model id the server shows>
EMBED_MODEL=<an embedding model loaded in the same server>
```

---

## 7. Embeddings: one provider for both chat and embeddings

In this course, **one `AI_PROVIDER` serves both chat and embeddings**. `chatModel()` and `embeddingModel()` in [`shared/src/models.ts`](shared/src/models.ts) both switch on the same value, and `openai-compatible` uses the same base URL and key for both. You can't, for example, chat on Groq and embed on Ollama just by editing `.env`.

That matters for providers without embeddings, such as Groq and Together (serverless). What to do in practice:

| Lessons | Needs embeddings? | What to use |
|---|---|---|
| 01 (except post 06), 02, 03, 06, 08 | No | Any provider, including Groq and Together |
| 01 post 06, 04, 05, 07, 09, 10 | Yes | A provider with both: **Ollama**, Azure, Bedrock, OpenAI, Gemini, OpenRouter, or a local server |

Practical options:

1. **Simplest:** keep `AI_PROVIDER=ollama` as your default (you already have `qwen3-embedding:4b`), and switch to Groq only to try a chat lesson.
2. Use a provider that does both, such as **Gemini** (free tier) or **OpenRouter**, when you want a cloud model for the RAG lessons.
3. Advanced: run a gateway such as LiteLLM that sends chat to one vendor and embeddings to another behind one OpenAI-compatible URL (lesson 08 post 08 mentions it), or add a separate embedding provider setting to `models.ts`. Neither is part of the course code today.

**Important:** embeddings from different models are not comparable. If you change `EMBED_MODEL`, rebuild the RAG index (`npm run ingest -w 04-rag`) before searching.

---

## 8. Test that it works

After editing `.env`, run these from the repo root:

```bash
# 1. one chat call: prints "provider:model" and the reply
npm run post:00 -w 01-foundations-structured-output

# 2. one embedding call (skip on Groq / Together)
npm run post:06 -w 01-foundations-structured-output

# 3. for Ollama only: is the server up and are both models pulled?
npm run check:ollama
```

You should see your provider and model in the first line, for example `Active model: azure:chat-main`, and then a short reply. If you get an error, look it up in the next sections.

For Azure and Bedrock you can also first look at the exact request the code would send, without spending anything: `cd 08-cloud && npm run post:02:offline` (Azure) or `npm run post:03:offline` (Bedrock).

---

## 9. Security notes

- **Never commit `.env`.** It's already listed in [`.gitignore`](.gitignore). Check with `git status` that it never shows up. Share settings through `.env.example`, which only has placeholders.
- **Don't paste keys** into chats, screenshots, tickets or code. Each lesson reads them from `.env` for you.
- **If a key leaks, rotate it at once:** delete or regenerate it in the provider console, then update `.env`. Azure gives you two keys for exactly this. AWS: deactivate and delete the access key in IAM. OpenAI, Groq, OpenRouter, Google: delete the key on the keys page and make a new one. Scanners find leaked keys on GitHub within minutes.
- **Set a budget and alerts before your first call:**
  - Azure: [Cost Management budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets).
  - AWS: [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html).
  - OpenAI: monthly budget and alerts on the billing / limits settings.
  - OpenRouter: a credit limit per key.
- **Least privilege:** give a key only what it needs. For example, use the small Bedrock policy above instead of an admin user.
- **Keep patient data out of prompts** on any provider your organization hasn't approved for it. The course uses fictional clinic data on purpose. Real PHI or personal data only belongs on a provider and region covered by your organization's agreements (for example a BAA in the US, or your hospital's approved Azure tenant). In India, also check your organization's policy under the DPDP Act. Free tiers may use your prompts to improve the product.
- **Production:** prefer keyless auth (Entra ID managed identity on Azure, IAM roles on AWS) over static keys. [Lesson 08](08-cloud/README.md) covers both.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing env var …` | The variable is empty, missing, or still a `<placeholder>` | Set it in the **repo-root** `.env` (not in a lesson folder). |
| **401 Unauthorized** / `invalid api key` | Wrong or deleted key; key copied with a space; wrong variable for this `AI_PROVIDER` | Copy the key again. Azure: use KEY 1 of *this* resource. OpenAI-compatible: the key must match the provider in `OPENAI_COMPAT_BASE_URL`. |
| **403** / `AccessDeniedException` (Bedrock) | IAM policy missing `bedrock:InvokeModel` or the inference-profile resource; Anthropic form not submitted; Marketplace first-use setup failed | Fix the policy; submit the use-case form; wait a few minutes after first use; try an Amazon model first. |
| **404** `DeploymentNotFound` (Azure) | `CHAT_MODEL` is a model family name, not your deployment name; or the deployment is in another resource | Use the exact deployment name from the deployments page. Check `AZURE_RESOURCE_NAME`. |
| **404 on `/responses`** (Azure) | That deployment/region doesn't support the Responses API | See [lesson 08 post 02](08-cloud/02-azure-openai/README.md) for the Chat Completions switch. |
| **404** / `model not found` (others) | Model id misspelled, retired, or not on this provider; base URL wrong | Copy the id from the provider's model list; check the base URL ends where the table says (e.g. `/v1`, `/openai/v1`, `/v1beta/openai`). |
| Bedrock `ValidationException` about on-demand throughput / inference profile | The model can only be called through an inference profile | Use the profile id, e.g. `us.` or `global.` + model id. |
| **429** Too Many Requests / quota exceeded | Over the TPM/RPM limit (Azure per deployment; free tiers are low) or out of credits | Wait and retry; raise the deployment's TPM in Quotas (Azure); add credits; use a smaller model. Lesson 06 shows retries and fallbacks. |
| Region errors (`Credential should be scoped to a valid region`, model "not available in this region") | `AWS_REGION` differs from where the key was made or where the model exists; Azure model not offered in the resource's region | Match `AWS_REGION` to the key and model card. On Azure, deploy in a region that lists the model, or create a resource there. |
| **400** about `response_format` / `json_schema` | The model doesn't support strict structured output | Pick a model that does, or stay on another provider for lesson 01 post 07. |
| Embedding call fails on Groq/Together | No embedding model there | See [section 7](#7-embeddings-one-provider-for-both-chat-and-embeddings). |
| `ECONNREFUSED localhost:11434` | Ollama isn't running | Open the Ollama app or run `ollama serve`, then `npm run check:ollama`. |

---

**[🏠 Back to course home](README.md)** · [Course toolkit (`shared/`)](shared/README.md) · [Lesson 08: cloud providers](08-cloud/README.md)
