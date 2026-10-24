# Lesson 09 — Deployment: a blog series

**Turn the RAG pipeline into a service you can run in production: an HTTP API that survives slow models and busy days, a container image, Kubernetes manifests, and a CI pipeline that fails when answer quality drops. 9 short posts.**

On your laptop, the assistant is a script. In the hospital it's a service: forty nurses at shift change, a model that sometimes takes 30 seconds, a cluster that restarts pods during the day, and a colleague whose "small prompt tweak" quietly makes answers worse.

LLM services fail in their own ways. Requests are **slow** (seconds, not milliseconds) and **expensive**, the model backend can be **down while your process is fine**, and quality can **regress without any error**. This series handles each of those, in plain Node with no web framework, so you can see every moving part.

Each post starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file. Read them in order.

## What you will be able to do

This lesson covers **Topic 9** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Ship an LLM service: validate input, time out and cancel model calls, shed load, report health and readiness honestly, shut down gracefully, package it as a small non-root container, run it on Kubernetes with probes and autoscaling, and gate every change in CI on an eval score.**

After the 9 posts you should be able to:

1. **Validate requests at the edge**: size limits, a schema, clear 4xx errors.
2. **Time out model calls so they really stop**, with `AbortSignal`.
3. **Shed load** with `429` + `retry-after` instead of queueing forever.
4. **Separate health from readiness** and check the model backend the right way.
5. **Shut down gracefully** on `SIGTERM`, finishing in-flight answers.
6. **Assemble the RAG service** from those pieces, with a smoke test that runs without a model.
7. **Build a container image**: multi-stage, pinned, non-root, read-only friendly.
8. **Deploy to Kubernetes** with startup, readiness and liveness probes, an HPA and a PodDisruptionBudget.
9. **Gate CI on evals**, so a quality drop fails the build.

You'll also *recognise* KEDA and custom-metric autoscaling (CPU is a weak signal for LLM services).

## Set up once (5 minutes)

If you did lesson 01, you are already set up. This lesson uses lesson 04's RAG pipeline (`@learn/rag`) and its documents.

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models come from .env only (CHAT_MODEL, EMBED_MODEL). Optional for this lesson:
#    PORT=8080  MAX_CONCURRENT=4  REQUEST_TIMEOUT_MS=60000  RAG_DB_PATH=...  EVAL_THRESHOLD=0.6
npm run check:ollama

# 3. prove the setup works, without calling any model
cd 09-deployment
npm run test:offline
```

Docker and a Kubernetes cluster are optional: posts 07 and 08 work without them. (The course author did **not** have Docker or a cluster available, so the image build and the manifests were checked but not run. CI builds the image and validates the manifests on every push.)

The examples import a few small helpers (`chatModel()`, `section()` and friends) from the course helper package `@learn/shared`. [What each helper does](../shared/README.md).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [Validate at the edge](01-validate-at-the-edge/README.md) | Size limits, a zod schema and clear 400/413 errors, before anything costs a model call. |
| 2 | [Timeouts that really stop the work](02-timeouts-that-abort/README.md) | Why `Promise.race` leaks money, and how `abortSignal` cancels the call. |
| 3 | [Load shedding](03-load-shedding/README.md) | A concurrency limit that answers `429` + `retry-after`, and clients that honour it. |
| 4 | [Health vs readiness](04-health-and-readiness/README.md) | "Alive" isn't "can serve"; what to check for Ollama, Azure, Bedrock. |
| 5 | [Graceful shutdown](05-graceful-shutdown/README.md) | `SIGTERM` → stop new traffic, finish answers in progress, exit. |
| 6 | [The RAG service](06-the-rag-service/README.md) | Posts 01–05 around lesson 04's pipeline, plus JSON logs and a smoke test. |
| 7 | [The container image](07-container-image/README.md) | A small, pinned, non-root, multi-stage image, and why each line is there. |
| 8 | [Kubernetes](08-kubernetes/README.md) | Probes, resources, security context, HPA and PDB, with a probe simulator. |
| 9 | [CI with an eval gate](09-ci-eval-gate/README.md) | GitHub Actions: offline checks on every push, and a build that fails when quality drops. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:09` | Run one post's example (posts 02, 04, 06 and 09 call your models). |
| `npm run post:02:offline`, `post:04:offline`, `post:06:offline`, `post:09:offline` | The same with fakes (the other posts never need a model). |
| `npm run test:offline` | Run every offline example (CI runs this). |
| `npm start` | Start the real service on port 8080 (`node 06-the-rag-service/server.ts`). |
| `npm run docker:build` | Check the Dockerfile and build the image (needs Docker). |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

## What's in this folder

```
09-deployment/
├── README.md                              ← you are here (series index)
├── 01-validate-at-the-edge/               README.md (the post) + example.ts (the code)
├── 02-timeouts-that-abort/
├── 03-load-shedding/
├── 04-health-and-readiness/
├── 05-graceful-shutdown/
├── 06-the-rag-service/                    + app.ts (the HTTP app) and server.ts (the entry point)
├── 07-container-image/
├── 08-kubernetes/
├── 09-ci-eval-gate/
├── Dockerfile                             the image (post 07); build it from the repo root
├── k8s/                                   configmap.yaml + deployment.yaml (post 08)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

The CI workflow lives at the repo root: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (post 09).

**Start here → [Post 1: Validate at the edge](01-validate-at-the-edge/README.md)**

**Before this lesson:** [Lesson 08 — Cloud providers & the gateway](../08-cloud/README.md) made the model a configuration choice. **After this lesson:** [Lesson 10 — Capstone](../10-capstone/README.md) puts everything together in a healthcare agent.
