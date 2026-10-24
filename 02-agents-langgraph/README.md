# Lesson 02 — Agents with LangGraph.js: a blog series

**From "an agent is just a loop" to durable human approval and multi-agent handoffs, in 8 short posts.**

In [lesson 01](../01-foundations-structured-output/README.md) the AI SDK ran a tool loop for you inside one `await`. That is perfect for small jobs. Real hospital workflows need more: steps that must happen in order, a flaky lab API, a hard stop when the model goes in circles, a nurse who approves a cancellation tomorrow morning, and different "desks" for billing and clinical questions.

This series shows how to build agents as **explicit state machines** with [LangGraph.js](https://langchain-ai.github.io/langgraphjs/), the framework named in 15 of the 25 job postings in the learning map. Each post is a short blog article: a real problem, the idea in plain English, then a small runnable TypeScript file walked through piece by piece.

Read the posts in order. Each one builds on the one before it.

## What you will be able to do

This lesson covers **Topic 2 — Agents & orchestration** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Build agents as graphs you can reason about: typed state, nodes and edges you own, retries and fallbacks for failures, a step limit, memory that survives restarts, a human approval step before risky actions, and handoffs between specialist agents.**

After the 8 posts you should be able to:

1. **Explain** what makes a program an "agent" (a loop that decides its next step) and when a fixed workflow is better.
2. **Build a LangGraph state graph**: state with reducers, nodes that return partial updates, normal and conditional edges.
3. **Put a model in a graph** as an `agent ⇄ tools` loop, and stream node-by-node updates.
4. **Recover from failures** with a `retryPolicy` and a fallback path.
5. **Stop runaway agents** with `recursionLimit` and handle `GraphRecursionError`.
6. **Give an agent memory** with checkpointers and `thread_id`, in RAM and in SQLite.
7. **Pause for human approval** with `interrupt()` and resume from another process with `Command({ resume })`.
8. **Split work across agents** with a supervisor and `Command({ goto })` handoffs.

You will also be able to answer the PLAN week-2 question: *when would I pick a LangGraph graph over a plain AI SDK tool loop?*

## Set up once (5 minutes)

If you finished lesson 01's setup, you are already done. Otherwise:

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models live in .env only (no code names a model)
cp .env.example .env
#    set CHAT_MODEL → a chat model that supports tool calling (posts 01, 03, 06, 07, 08)

# 3. check that Ollama is reachable and your model exists
npm run check:ollama

# 4. prove the setup works, without calling any model
cd 02-agents-langgraph
npm run test:offline
```

The examples use the course helper package **`@learn/shared`**: it loads the models named in `.env` (`chatModel()`, `embeddingModel()`), reads settings (`env`), and prints readable output (`section()`, `stripThinking()`). See [the `@learn/shared` guide](../shared/README.md) for every helper.

**One note on providers.** Post 01 uses the AI SDK, so it follows `AI_PROVIDER` like lesson 01. The LangGraph posts use LangChain's `ChatOllama`, which reads the model name from the same `.env` (`CHAT_MODEL`, `OLLAMA_BASE_URL`) but always talks to Ollama. To use Azure or Bedrock in a graph you would swap `ChatOllama` for `AzureChatOpenAI` or `ChatBedrockConverse`; the graph code does not change.

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [What is an agent? (the loop, by hand)](01-what-is-an-agent/README.md) | Decide → act → observe, written as a plain `for` loop, so no framework feels like magic. |
| 2 | [State graphs: state, nodes and edges](02-state-graphs/README.md) | A triage workflow with no model at all: the graph is control flow *you* own. |
| 3 | [An LLM agent as a graph](03-agent-graph/README.md) | The loop from post 1 as two nodes and one conditional edge, streamed step by step. |
| 4 | [Retries and failure recovery](04-retries-and-recovery/README.md) | The lab API times out. Retry with backoff, and when that is not enough, fall back honestly. |
| 5 | [Step limits: stopping a runaway agent](05-step-limits/README.md) | A model that asks for the same slot forever, and the `recursionLimit` that stops it. |
| 6 | [Checkpoints, threads and memory](06-checkpoints-and-memory/README.md) | Why the agent "remembers" bed 4, and how that memory survives a restart. |
| 7 | [Human approval that survives a restart](07-human-approval/README.md) | `interrupt()` before a cancellation, the process exits, a new one resumes with the decision. |
| 8 | [Multi-agent handoffs](08-multi-agent-handoffs/README.md) | A supervisor routes to billing or clinical, and billing hands off what it must not answer. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Budget about one evening per two posts. Posts 6 and 7 end with the **week-2 exercises from the learning map**.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:08` | Run one post's example (posts 01, 03, 06, 07, 08 call your model). |
| `npm run post:07:resume` / `npm run post:07:reject` | Resume post 7's paused run with an approval or a rejection. |
| `npm run post:03:offline` (also 06, 07, 08) | Run the same graph with a scripted "model", no LLM. |
| `npm run test:offline` | Run every example that needs no model, to check your setup. |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

Posts 02, 04 and 05 never call a model: they teach graph mechanics with deterministic code, so you can predict every line of output.

## What's in this folder

```
02-agents-langgraph/
├── README.md                     ← you are here (series index)
├── 01-what-is-an-agent/          README.md (the post) + example.ts (the code)
├── 02-state-graphs/
├── 03-agent-graph/
├── 04-retries-and-recovery/
├── 05-step-limits/
├── 06-checkpoints-and-memory/
├── 07-human-approval/
├── 08-multi-agent-handoffs/
├── data/                         created when you run posts 06 and 07 (SQLite checkpoints; git-ignored)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

**Start here → [Post 1: What is an agent? (the loop, by hand)](01-what-is-an-agent/README.md)**

---

**Before this lesson:** [Lesson 01 — Foundations](../01-foundations-structured-output/README.md) (tokens, prompting, structured output, tool calling).
**After this lesson:** [Lesson 03 — MCP](../03-mcp/README.md) turns your tools into a server any agent or IDE can discover and call.
