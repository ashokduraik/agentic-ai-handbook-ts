# Agentic AI Handbook (TypeScript)

**Learn to build LLM apps and agents that you can trust in production: typed outputs, agents, MCP, RAG, evals, guardrails, tracing, cloud providers and deployment. All in TypeScript, all runnable on your own laptop with Ollama.**

This course is for experienced Node.js engineers who are new to LLM engineering. You already know how to build and ship services. What's new is the model: it is slow, costs money per token, and is sometimes wrong. Every lesson teaches one part of handling that well.

The examples share one made-up healthcare scenario: a clinic's scheduling and front-desk assistant. All patient data is fictional.

---

## How the course is organised

- The course has **10 lessons**. Each lesson is a short **blog series** of **posts**: 80 posts in total.
- Every post has the same shape:
  1. **A real problem**, in a sentence or two.
  2. **The idea, in plain English**, before any code.
  3. **A small, commented `example.ts`**, walked through piece by piece.
  4. **Run it**, **what you should see**, **try it yourself**, and **key takeaways**.
- Each post lives in its own folder, `NN-slug/`, with its `README.md` (the post) and `example.ts` side by side.
- Each lesson's `README.md` is its landing page: what you'll learn, setup, and the list of posts.
- **← Previous · 📚 Series index · Next →** links at the bottom of every post run through the whole course, from post 00 of lesson 01 to the last post of the capstone.

Other useful pages:

| Page | What it's for |
|---|---|
| [PLAN.md](PLAN.md) | The week-by-week schedule, extra reading, extension exercises and a progress checklist. |
| [agentic-ai-nodejs-learning-map.md](agentic-ai-nodejs-learning-map.md) | The learning map: the topics and goals this course is built from. |
| [shared/README.md](shared/README.md) | `@learn/shared`, the course's own small helper package: how `chatModel()`, `embeddingModel()`, `env` and the print helpers work. |
| [GETTING-API-KEYS.md](GETTING-API-KEYS.md) | Step-by-step guide to getting keys for Azure OpenAI, Amazon Bedrock, OpenAI, Groq, OpenRouter, Gemini and others, and putting them in `.env`. |

---

## One-time setup (about 15 minutes)

**You need:** Node.js 22.22 or newer (the `engines` field in `package.json`; developed on Node 26), npm, and [Ollama](https://docs.ollama.com/quickstart) running locally. Docker is optional (Jaeger in lesson 07, the image in lesson 09).

```bash
cd agentic-ai-handbook-ts

# 1. install everything once (npm workspaces: one install for all lessons)
npm install

# 2. create your settings file
cp .env.example .env         # then set CHAT_MODEL and EMBED_MODEL

# 3. pull the two models into Ollama (the same names you put in .env)
ollama pull <your-chat-model>
ollama pull <your-embedding-model>

# 4. check Ollama is reachable and both models are pulled
npm run check:ollama
```

### `.env`: the only place models are chosen

No model name is written in the code. Every example asks `@learn/shared` for "the chat model" or "the embedding model", and that reads `.env` at the repo root. To try another model or provider, edit `.env` only. `.env` is git-ignored, so your keys stay on your machine.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `ollama` (default) · `azure` · `bedrock` · `openai-compatible`. For anything other than Ollama, follow [GETTING-API-KEYS.md](GETTING-API-KEYS.md). |
| `OLLAMA_BASE_URL` | Default `http://localhost:11434`. |
| `CHAT_MODEL` | A chat model **that supports tool calling** (lessons 02, 03, 06 and 10 need it). |
| `EMBED_MODEL` | An embedding model (lessons 01 post 06, 04, 05, 07, 09, 10). |
| `FALLBACK_MODEL` | Optional second chat model (fallbacks in 06, routing in 08). |
| `JUDGE_MODEL` | Optional model for evals and red-teaming; defaults to `CHAT_MODEL`. |
| `RERANKER` | `llm` (score search results with the chat model) or `none`. |
| `TRACE_EXPORTER` | `console` (default) · `console-raw` · `otlp` · `langfuse` · `memory` (lesson 07). |

Results depend on the models you pick. Bigger tool-capable models make better agent decisions and steadier judges.

---

## Start here

👉 **[Lesson 01, post 00: The course toolkit](01-foundations-structured-output/00-course-toolkit/README.md)**: a 5-minute post that shows how every example gets its model from `.env`, and makes your first call. Then follow the **Next →** links.

---

## Course map

Weeks follow [PLAN.md](PLAN.md) (about 8–10 hours a week). Week 12 is for your portfolio and catching up. For a 10-week version, merge weeks 8 and 9 and skip week 12.

| # | Lesson | You'll learn | Posts | Weeks |
|---|---|---|---|---|
| 01 | [Foundations](01-foundations-structured-output/README.md) | Tokens, context windows, model calls and streaming, prompting, embeddings, typed JSON output with Zod, and tool calling. | 8 + post 00 | 1 (week 1) |
| 02 | [Agents with LangGraph.js](02-agents-langgraph/README.md) | Agents as explicit state graphs: retries, step limits, checkpoints, durable human approval and multi-agent handoffs. | 8 | 1 (week 2) |
| 03 | [Model Context Protocol (MCP)](03-mcp/README.md) | Build an MCP server (tools, resources, prompts) over stdio and HTTP with auth, and let an agent discover and use it. | 7 | 1 (week 3) |
| 04 | [RAG](04-rag/README.md) | Chunking, vector and keyword search on SQLite, hybrid search, reranking, and grounded answers with citations. | 8 | 1 (week 4) |
| 05 | [Evals](05-evals/README.md) | Measure quality with a golden dataset, code checks, an LLM judge, autoevals, promptfoo and a CI quality gate. | 7 | 1 (week 5) |
| 06 | [Guardrails & fallbacks](06-guardrails/README.md) | Validate and repair output, timeouts, circuit breakers, fallback chains, tool allow-lists, approvals, input/output guards and red-teaming. | 10 | 1 (week 6) |
| 07 | [Observability & cost](07-observability/README.md) | OpenTelemetry traces with the GenAI conventions: tokens, latency and cost per request, sent to Jaeger or Langfuse. | 6 | 1 (week 7) |
| 08 | [Cloud providers & the gateway](08-cloud/README.md) | Switch Ollama ↔ Azure OpenAI ↔ Bedrock through `.env`, plus model aliases, middleware, a cache, a cost ledger and routing. | 8 | 1 (week 8) |
| 09 | [Deployment](09-deployment/README.md) | A production HTTP service: validation, timeouts, load shedding, health checks, graceful shutdown, a container image, Kubernetes and a CI eval gate. | 9 | 1 (week 9) |
| 10 | [Capstone: a guarded clinical-scheduling agent](10-capstone/README.md) | Everything together: a FHIR-shaped store behind MCP, least privilege, human approval for writes, PII redaction, tracing and evals. | 8 | 2 (weeks 10–11) |

---

## Running the examples

Every post has one `example.ts`, and every lesson has an npm script per post. You can run them from the repo root with `-w <lesson-folder>`, or from inside the lesson folder.

```bash
# from the repo root
npm run post:03 -w 04-rag

# or from inside the lesson folder
cd 04-rag
npm run post:03

# many posts also have an offline version: a scripted fake model, no Ollama needed
npm run post:03:offline -w 04-rag
```

Each post's **Run it** section gives the exact command, and some lessons have extra named scripts (for example `ingest`, `search` and `ask` in 04, `evals` in 05, `redteam` in 06, `start` in 09). Each lesson's landing page lists them in its **Running the examples** table.

### Checks that need no model

```bash
npm run typecheck                          # tsc --noEmit in every workspace
npm run test:offline                       # every lesson's offline examples: fake models, fake embeddings, real MCP servers
npm run check:links --workspaces --if-present   # every relative link in every lesson (plus this README and PLAN.md)
```

Run one lesson only by adding `-w <lesson-folder>`, for example `npm run test:offline -w 06-guardrails`.

Generated files go to each lesson's `data/` (SQLite: the RAG index, checkpoints) and `output/` (eval reports). Both are git-ignored and safe to delete.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request once the repo is on GitHub:

- **checks**: `npm ci`, type-check, all offline tests, and validation of the Kubernetes manifests with kubeconform. No model needed.
- **evals**: pulls your models into an Ollama service container, runs lesson 05's RAG evals (`evals:fast`) and **fails the build** if the score drops below `EVAL_THRESHOLD` (default 0.6), then runs the promptfoo assertions (non-blocking to start with). It runs only when you set the repository variables `CI_CHAT_MODEL` and `CI_EMBED_MODEL` (pick small models). Lesson 09 post 09 explains it.
- **image**: builds lesson 09's container image (it is not pushed anywhere).

---

## What was and wasn't tested

Honest notes, so you know where to be careful:

- ✅ **Tested:** `npm run typecheck` and `npm run test:offline` in every lesson; the link checks; and the examples run against local Ollama models while the course was written.
- ⚠️ **Small local models are imperfect.** They sometimes skip a tool call, call the wrong tool, or give noisy judge scores. The posts point this out where it happens. A bigger model usually fixes it.
- ❌ **Not tested live** (no account or tool was available):
  - **Docker**: the lesson 09 image build and the lesson 07 Jaeger container.
  - **Kubernetes**: the lesson 09 manifests were checked, not applied to a cluster.
  - **Azure OpenAI** and **Amazon Bedrock**: only the offline request capture in lesson 08 posts 02 and 03 was run; real cloud calls were not.
  - **Langfuse**: the lesson 07 Langfuse export was not run against a Langfuse server.
  - **GitHub Actions**: the workflow has not been run on GitHub yet.
  - The other hosted APIs in [GETTING-API-KEYS.md](GETTING-API-KEYS.md) come from their official docs, not live calls.

---

## Conventions

- TypeScript runs directly with `tsx`. Lesson 09's server and the capstone's MCP child process run on plain `node` (built-in type stripping).
- Every dependency is pinned to an exact version and uses current major APIs (AI SDK 7, LangGraph.js 1.x, MCP SDK 1.x, OpenTelemetry JS SDK 2.x, Zod 4).
- One shared scenario across lessons: a fictional clinic, so you learn the techniques, not a new domain each time.
