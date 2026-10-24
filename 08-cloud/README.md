# Lesson 08 — Cloud providers & the gateway: a blog series

**Run the same agent on Ollama, Azure OpenAI or Amazon Bedrock by changing `.env`, then put a thin "gateway" in front of your models to control cost. 8 short posts.**

Your hospital's IT team says: *"Production must run on our Azure tenant."* A partner hospital says: *"We're an AWS shop."* And finance says: *"Why does the FAQ bot use the most expensive model?"*

This series shows how to stay **portable** (one codebase, any provider, chosen in configuration) and **in control** (aliases, central defaults, a response cache, a cost ledger with a budget, and routing between cheap and expensive models). All of it uses AI SDK building blocks you can read in a few lines.

Each post starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file. Read them in order.

## What you will be able to do

This lesson covers **Topic 8** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Use one cloud AI platform (Azure OpenAI or Amazon Bedrock) without locking your code to it: choose the provider in configuration, authenticate the production way, and add a gateway layer with model aliases, a cache, a cost ledger and a cheap-vs-expensive router.**

After the 8 posts you should be able to:

1. **Explain the provider abstraction** and switch Ollama → Azure → Bedrock with `.env` only.
2. **Set up Azure OpenAI**: deployments, the Responses vs Chat Completions APIs, and keyless Entra ID auth.
3. **Set up Amazon Bedrock**: model access, inference profiles, and the AWS credential chain.
4. **Use model aliases** (`smart`, `fast`) so code asks for a capability, not a model id.
5. **Write middleware** that enforces defaults for every call.
6. **Cache responses** safely, with a key that includes tools and settings.
7. **Keep a cost ledger** per model and stop at a budget.
8. **Route** easy questions to a cheap model and hard ones to a strong one, and know when to use a managed gateway instead (LiteLLM, Azure API Management, Bedrock inference profiles).

You'll also *recognise* Google Vertex AI: the same `@ai-sdk/*` pattern applies.

## Set up once (5 minutes)

If you did lesson 01, you are already set up.

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models come from .env only. For this lesson, optionally:
#    FALLBACK_MODEL=<a second, smaller model>     the "fast" alias (posts 04, 08)
#    SMART_MODEL / FAST_MODEL                      override the aliases (posts 04, 08)
#    PRICE_PER_MTOK_IN / _OUT, BUDGET_USD          cost ledger (posts 07, 08)
#    AI_PROVIDER=azure|bedrock + their settings    posts 02, 03 (needs a cloud account)
npm run check:ollama

# 3. prove the setup works, without calling any model or cloud
cd 08-cloud
npm run test:offline
```

**You do not need a cloud account.** Posts 02 and 03 capture the exact HTTP request your code would send to Azure or Bedrock, so you can learn the setup offline. The real calls run only when you configure that provider. (The course author tested the offline parts and the Ollama paths. Real Azure and Bedrock calls were **not** tested.)

The examples import a few small helpers (`chatModel()`, `section()` and friends) from the course helper package `@learn/shared`. [What each helper does](../shared/README.md).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [One interface, many providers](01-provider-abstraction/README.md) | Why your code never imports a vendor SDK, and how `.env` picks Ollama, Azure, Bedrock or any OpenAI-compatible server. |
| 2 | [Azure OpenAI: deployments and keyless auth](02-azure-openai/README.md) | Deployment names, the two APIs, Entra ID tokens, and what really goes over the wire. |
| 3 | [Amazon Bedrock: model access and the credential chain](03-amazon-bedrock/README.md) | Model access, inference profiles, signed requests, and credentials without static keys. |
| 4 | [Model aliases](04-model-aliases/README.md) | Ask for `smart` or `fast`; re-point them in config. |
| 5 | [Middleware: one place for defaults and policies](05-middleware-and-defaults/README.md) | Wrap a model once; every call gets the same defaults. Order matters. |
| 6 | [A response cache](06-response-cache/README.md) | Don't pay twice for the same answer, and why the key must include tools and settings. |
| 7 | [A cost ledger and a budget](07-cost-ledger/README.md) | Count tokens and dollars per model, and refuse calls past a limit. |
| 8 | [Routing cheap vs expensive: the gateway](08-routing-cheap-vs-expensive/README.md) | Put it all together, route by question, and meet the managed versions. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:08` | Run one post's example with your configured provider. |
| `npm run post:01:offline` … `npm run post:08:offline` | The same with fake models and no network. |
| `npm run test:offline` | Run every offline example, to check your setup. |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

The older script names `swap` and `gateway` still work; they run posts 01 and 08.

## What's in this folder

```
08-cloud/
├── README.md                              ← you are here (series index)
├── 01-provider-abstraction/               README.md (the post) + example.ts (the code)
├── 02-azure-openai/
├── 03-amazon-bedrock/
├── 04-model-aliases/
├── 05-middleware-and-defaults/
├── 06-response-cache/                     exports createCache (used by post 08)
├── 07-cost-ledger/                        exports createLedger (used by post 08)
├── 08-routing-cheap-vs-expensive/
├── support/fakes.ts                       fake models and a request-capturing fetch
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

The provider switch itself lives in [`shared/src/models.ts`](../shared/src/models.ts), used by every lesson.

**Start here → [Post 1: One interface, many providers](01-provider-abstraction/README.md)**

**Before this lesson:** [Lesson 07 — Observability & cost](../07-observability/README.md) gave you the numbers (tokens, latency, cost). **After this lesson:** [Lesson 09 — Deployment](../09-deployment/README.md) ships the service in a container.
