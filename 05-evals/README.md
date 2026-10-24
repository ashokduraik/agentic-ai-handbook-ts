# Lesson 05 — Evals: measuring an AI app, a blog series

**From "it answered my three test questions" to a golden dataset, layered metrics, a model as judge and a CI quality gate, in 7 short posts.**

At the end of lesson 04, the RAG app answered *"Can children visit the ICU?"* with a valid citation, and the wrong rule. No code check noticed. In normal backend work you'd write a unit test; but the "function" here is a model whose output changes with every prompt tweak, model swap, chunk size or reranker setting. You can't assert an exact string.

**Evals** are the tests of AI apps: a fixed set of real questions with known good answers, scored by cheap code checks first and by a model acting as a judge where meaning matters, run on every change, with a threshold that fails the build. This series builds exactly that around the lesson 04 pipeline, and then the same suite in **promptfoo**, the most common Node tool for it.

Each post is a short blog article: a real problem, the idea in plain English, then a small runnable TypeScript file walked through piece by piece. Read them in order.

## What you will be able to do

This lesson covers **Topic 5 — Evals & hallucination checks** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Know whether a change made your AI app better or worse, with numbers instead of impressions: a golden set of real questions, cheap code checks, a model-as-judge for faithfulness, and a CI gate that fails when quality drops.**

After the 7 posts you should be able to:

1. **Explain** why AI apps need evals, and measure a real decision (reranker on or off) with hit@k.
2. **Build a golden dataset**: answerable and must-refuse cases, any-of and all-of facts, expected sources, reference answers.
3. **Write code checks** (retrieval hit, refusal, facts, citations) and know what they can't catch.
4. **Build an LLM judge** for faithfulness (claims → supported?), and treat a failed judge as "no score".
5. **Use autoevals** scorers (Faithfulness, Factuality) through any OpenAI-compatible endpoint.
6. **Run a harness** over the whole dataset that writes a report and **gates CI** with an exit code.
7. **Express the same suite in promptfoo**, with your app and your judge as custom providers. Recognise Evalite.

## Set up once (5 minutes)

If you finished lesson 01's setup, you are almost done:

```bash
# 1. at the repo root (agentic-ai-handbook-ts/); needs Node 22.5+ (lesson 04 uses node:sqlite)
npm install

# 2. models live in .env only
cp .env.example .env
#    CHAT_MODEL and EMBED_MODEL: the app under test (lesson 04)
#    JUDGE_MODEL (optional): the judge; defaults to CHAT_MODEL. Use one at least as strong as the app's model.
#    RERANKER=none or llm; EVAL_THRESHOLD (optional, default 0.6)

# 3. check that Ollama is reachable and your models exist
npm run check:ollama

# 4. prove the setup works, without calling any model
cd 05-evals
npm run test:offline
```

The examples use the course helper package **`@learn/shared`**: it loads the models named in `.env` (`chatModel()`, `embeddingModel()`), reads settings (`env`), and prints readable output (`section()`, `stripThinking()`). See [the `@learn/shared` guide](../shared/README.md) for every helper.

The evals build their own in-memory index from `04-rag/docs/` every run, so you don't need `npm run ingest` first.

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [Why evals?](01-why-evals/README.md) | Settle lesson 04's open question, "does the reranker help?", with two numbers instead of opinions. |
| 2 | [A golden dataset](02-golden-dataset/README.md) | The most valuable eval asset: real questions, facts to look for, sources, and cases that must be refused. |
| 3 | [Code checks](03-code-checks/README.md) | Free, fast, deterministic checks: hit@3, refusal, any-of and all-of facts, citations. And their blind spot. |
| 4 | [An LLM judge for faithfulness](04-llm-judge-faithfulness/README.md) | Split the answer into claims, check each against the context: catch the flipped ICU rule. |
| 5 | [Ready-made scorers with autoevals](05-autoevals/README.md) | Faithfulness and Factuality from a tested library, through Ollama's OpenAI-compatible API. |
| 6 | [The eval harness and the CI gate](06-eval-harness-and-gate/README.md) | Every case, every metric, a report file, and an exit code that fails the build. |
| 7 | [promptfoo](07-promptfoo/README.md) | The same suite as YAML, with the RAG app and the judge as custom providers. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Post 7 ends with the **week-5 exercise from the learning map**.

## Running the examples

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:07` | Run one post's example (posts 02 and 03 need no model). |
| `npm run post:01:offline` (also 04, 06) | The same code with fake embeddings / fake models, no Ollama needed. |
| `npm run evals` | The full harness: code checks + judges, report in `output/eval-report.json`, exit 1 below `EVAL_THRESHOLD`. |
| `npm run evals:fast` | The harness without judges: what CI runs. |
| `npm run promptfoo` | The promptfoo suite; results in `output/promptfoo-results.json` (`npx promptfoo view` for the web UI). |
| `npm run test:offline` | Every post that can run without a model, plus the harness against a fake app. |
| `npm run typecheck` / `npm run check:links` | Type-check everything / check every link in these posts. |

## What's in this folder

```
05-evals/
├── README.md                          ← you are here (series index)
├── 01-why-evals/                      README.md (the post) + example.ts (the code)
├── 02-golden-dataset/                 + dataset.ts (the cases every other post uses)
├── 03-code-checks/                    + checks.ts
├── 04-llm-judge-faithfulness/         + faithfulness.ts
├── 05-autoevals/
├── 06-eval-harness-and-gate/          the harness behind npm run evals / evals:fast
├── 07-promptfoo/                      + promptfooconfig.yaml, rag-provider.ts, judge-provider.ts
├── output/                            eval-report.json, promptfoo-results.json (git-ignored)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

The app under test is lesson 04's pipeline, imported as `@learn/rag`. CI (`.github/workflows/ci.yml`) runs `npm run evals:fast` and `npm run promptfoo` in this folder and uploads `output/`.

**Start here → [Post 1: Why evals?](01-why-evals/README.md)**

---

**Before this lesson:** [Lesson 04 — RAG](../04-rag/README.md) (the pipeline these evals measure).
**After this lesson:** [Lesson 06 — Guardrails](../06-guardrails/README.md) (validate input and output, and fail safely).
