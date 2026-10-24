# Lesson 07 — Observability & cost: a blog series

**See inside every request: which model ran, how long it took, how many tokens it used and what it cost. 6 short posts.**

Your assistant works on your laptop. In production, a nurse says *"it was really slow this morning"*, finance asks *"why did the AI bill double?"*, and a doctor reports *"it gave a wrong answer about the deposit yesterday"*. Without observability, all three are guesses.

This series adds **tracing** to everything you've built: a record of each request, step by step, with timings, token counts and the details you need to answer those questions. It uses **OpenTelemetry**, the vendor-neutral standard, so you can send the same data to Jaeger, Grafana, Langfuse or your cloud's tracing service.

Each post starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file. Read them in order.

## What you will be able to do

This lesson covers **Topic 7** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Trace every LLM request with OpenTelemetry, following the GenAI semantic conventions, so you can see tokens, latency and cost per request and per model. Send those traces to a backend such as Jaeger or Langfuse, where you can also track prompt versions and scores.**

After the 6 posts you should be able to:

1. **Explain traces, spans and attributes**, and set up OpenTelemetry in a Node app.
2. **Write a GenAI span by hand**, using the standard `gen_ai.*` attribute names, with prompts and answers kept out by default.
3. **Turn on the AI SDK's built-in telemetry** and nest its spans under your own request span.
4. **Work out tokens, latency (p50/p95) and cost per request and per model** from trace data.
5. **Trace a RAG pipeline** stage by stage, with quality signals on the spans.
6. **Send traces to a backend**: any OTLP backend (Jaeger, Tempo, Honeycomb…) or Langfuse, with prompt versions and scores.

Response caching and routing between cheap and expensive models are in [lesson 08](../08-cloud/README.md); this lesson gives you the numbers to decide on them.

## Set up once (5 minutes)

If you did lesson 01, you are already set up.

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models come from .env only. Optional settings for this lesson:
#    TRACE_EXPORTER=console        where spans go: console (default) | console-raw | otlp | langfuse | memory
#    OTEL_CAPTURE_CONTENT=true     also record prompts and answers on spans (off by default: PHI!)
#    PRICE_PER_MTOK_IN / _OUT      your provider's US$ price per 1M tokens (post 04)
#    LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL   (post 06, optional)
npm run check:ollama

# 3. prove the setup works, without calling any model
cd 07-observability
npm run test:offline
```

The examples import a few small helpers (`chatModel()`, `section()` and friends) from the course helper package `@learn/shared`. [What each helper does](../shared/README.md).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [Traces and spans: see where the time goes](01-traces-and-spans/README.md) | One request as a tree of timed steps, and the one file (`tracing.ts`) that decides where they go. |
| 2 | [The GenAI semantic conventions](02-genai-semantic-conventions/README.md) | Write a model-call span by hand with the standard `gen_ai.*` names, errors included, prompts left out. |
| 3 | [Let the AI SDK write the spans](03-ai-sdk-telemetry/README.md) | One line of setup, and every call, step and tool shows up nested under your request. |
| 4 | [Tokens, latency and cost per request](04-tokens-latency-cost/README.md) | From spans to a per-model table: cost per 1,000 requests, p50/p95 latency, a token histogram. |
| 5 | [Tracing a RAG pipeline](05-tracing-a-rag-pipeline/README.md) | One span per stage, with retrieval scores and citation checks recorded where you can see them. |
| 6 | [Sending traces somewhere useful: Jaeger and Langfuse](06-backends-jaeger-and-langfuse/README.md) | OTLP to any backend, plus Langfuse's users, sessions, prompt versions and scores. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:06` | Run one post's example (posts 02–05 call your models). |
| `npm run post:02:offline` … `npm run post:06:offline` | The same with fake models (post 01 never needs one). |
| `npm run test:offline` | Run every offline example, to check your setup. |
| `npm run jaeger` | Start a local Jaeger UI with Docker (post 06). |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

The older script names `manual`, `ai-sdk` and `rag` still work; they run posts 02, 03 and 05.

## What's in this folder

```
07-observability/
├── README.md                              ← you are here (series index)
├── 01-traces-and-spans/                   README.md (the post) + example.ts (the code)
│   └── tracing.ts                         the shared tracing setup (also used by lesson 10)
├── 02-genai-semantic-conventions/
├── 03-ai-sdk-telemetry/
├── 04-tokens-latency-cost/
├── 05-tracing-a-rag-pipeline/
├── 06-backends-jaeger-and-langfuse/
├── docker-compose.jaeger.yaml             a local Jaeger UI (post 06)
├── support/mock.ts                        fake models for offline runs (also used by lesson 10)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

**Start here → [Post 1: Traces and spans: see where the time goes](01-traces-and-spans/README.md)**

**Before this lesson:** [Lesson 06 — Guardrails & fallbacks](../06-guardrails/README.md) added retries, fallbacks and guards. **After this lesson:** [Lesson 08 — Cloud providers & the gateway](../08-cloud/README.md) uses these numbers to choose, cache and route models.
