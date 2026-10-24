# Lesson 01 — Foundations: a blog series

**From "what is a token?" to typed JSON and tool calls, in 8 short posts (plus a short post 00 on the course toolkit).**

You already know how to build backends: HTTP calls, schemas, queues, budgets. This series shows you what changes when one of your dependencies is a large language model. Each post is a short blog article: it starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file line by line.

Read the posts in order. Each one builds on the one before it.

## What you will be able to do

This lesson covers **Topic 1** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Understand how a model reads and limits text (tokens, context window, embeddings), tell it clearly what you want (prompting and context engineering), and call it from Node.js with the Vercel AI SDK so it returns typed, validated data and can use your functions as tools, on any provider.**

After the posts you should be able to:

1. **Explain** what a token is, why the provider's count differs from yours, and what a context window limits.
2. **Call any model from Node.js** with `generateText` / `streamText`, switching models only through `.env`.
3. **Write prompts** with clear instructions and few-shot examples, and **build the context** for a call on purpose.
4. **Explain embeddings** and find "similar meaning" with cosine similarity.
5. **Get typed JSON from a model** with a Zod schema, and handle the failure case.
6. **Give a model a tool**, and cap the tool loop with `stepCountIs`.

## Set up once (10 minutes)

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. pick your models, in .env only (no code names a model)
cp .env.example .env
#    set CHAT_MODEL  → a chat model that supports tool calling (needed in post 08)
#    set EMBED_MODEL → an embedding model (needed in post 06)
#    for Ollama, use names from `ollama list`

# 3. check that Ollama is reachable and your models exist
npm run check:ollama

# 4. prove the setup works, without calling any model
cd 01-foundations-structured-output
npm run test:offline
```

Change `.env` and every example runs on another model or provider (Ollama, Azure, Bedrock, any OpenAI-compatible API) with no code change. That works because every example gets its model from the course's small helper package, `@learn/shared` ([post 00](00-course-toolkit/README.md) explains it; [full tour](../shared/README.md)).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 0 | [The course toolkit (`@learn/shared`)](00-course-toolkit/README.md) | What `import { chatModel, section, stripThinking } from '@learn/shared'` is, and why models live only in `.env`. [Full tour of the toolkit →](../shared/README.md) |
| 1 | [What is an LLM, and what is a token?](01-llm-and-tokens/README.md) | Why "Pt c/o HTN" isn't cheaper than the full sentence, and why the provider's count is the bill. |
| 2 | [The context window](02-context-window/README.md) | Why the model "forgot" the allergy, and how to trim a long chat on purpose. |
| 3 | [Calling a model with the AI SDK, and streaming](03-model-calls-and-streaming/README.md) | One API for every vendor, the three outputs to always read, and answers that start in 0.3 s. |
| 4 | [Prompting: system, user and assistant roles](04-prompting/README.md) | Turn a chatty paragraph into one word your code can route. |
| 5 | [Context engineering](05-context-engineering/README.md) | Select, trim, compress, lay out: the right facts in, the private ones out. |
| 6 | [Embeddings: meaning as numbers](06-embeddings/README.md) | Match "heart doctor" to "cardiology" with vectors and cosine similarity. |
| 7 | [Structured output with Zod](07-structured-output/README.md) | A schema in, a typed and validated object out, and what to do when it fails. |
| 8 | [Tool calling and the tool loop](08-tool-calling/README.md) | The model asks, your code runs, `stepCountIs` keeps it safe. The core of every agent. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Budget about one evening per two posts. Posts 7 and 8 end with the **week-1 exercises from the learning map**.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:00` … `npm run post:08` | Run one post's example (calls your models). |
| `npm run post:01:offline` (also 02, 04, 05, 06, 07) | Run only the part that needs no model. |
| `npm run test:offline` | Run every offline part, to check your setup. |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

## What's in this folder

```
01-foundations-structured-output/
├── README.md                        ← you are here (series index)
├── 00-course-toolkit/               what `@learn/shared` is (read first)
├── 01-llm-and-tokens/               README.md (the post) + example.ts (the code)
├── 02-context-window/
├── 03-model-calls-and-streaming/
├── 04-prompting/
├── 05-context-engineering/
├── 06-embeddings/
├── 07-structured-output/
├── 08-tool-calling/
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

**Start here → [Post 0: The course toolkit](00-course-toolkit/README.md)**, then [Post 1: What is an LLM, and what is a token?](01-llm-and-tokens/README.md)

**After this lesson:** [Lesson 02 — Agents with LangGraph](../02-agents-langgraph/README.md) turns the tool loop from post 8 into a real agent with state, retries and human approval.
