# Lesson 03 — Model Context Protocol (MCP): a blog series

**From "what is MCP?" to a remote, authenticated MCP server that an agent discovers and uses, in 7 short posts.**

In [lesson 01](../01-foundations-structured-output/README.md) and [lesson 02](../02-agents-langgraph/README.md) your tools lived **inside** your agent's code. That works until a second app needs the same tools: the IDE, a chat app, another team's agent. Then you copy-paste tool definitions everywhere.

**MCP** is the open standard that fixes this. You wrap your hospital scheduling API **once** as an MCP server, and any MCP-aware app (Claude Desktop, Cursor, VS Code, your own agent) can discover and call it. Think of it as "USB-C for AI tools", or, closer to home for a Node architect: an OpenAPI-like contract plus a JSON-RPC wire protocol, designed for models.

Each post is a short blog article: a real problem, the idea in plain English, then a small runnable TypeScript file walked through piece by piece. Read them in order.

## What you will be able to do

This lesson covers **Topic 3 — MCP** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Expose your own APIs to any AI app through MCP: tools, resources and prompts, a client that talks to them, an agent that discovers them at runtime, and a remote HTTP server that knows who is calling.**

After the 7 posts you should be able to:

1. **Explain** MCP's parts (host, client, server, transport) and read the JSON-RPC messages they exchange.
2. **Design MCP tools**: input schemas, typed output (`outputSchema`), business errors (`isError`) versus invalid arguments, and annotations like `destructiveHint`.
3. **Expose resources**: read-only data by URI, including URI templates.
4. **Publish prompts**: reusable, parameterised templates a user picks.
5. **Run a real server over stdio**, inspect it with a client and the MCP Inspector, and follow the "never print to stdout" rule.
6. **Let an agent use MCP tools** with the AI SDK, with the host filtering out risky tools.
7. **Serve MCP over Streamable HTTP** with a bearer token that decides what the caller may do.

## Set up once (5 minutes)

If you finished lesson 01's setup, you are already done. Otherwise:

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models live in .env only (no code names a model)
cp .env.example .env
#    set CHAT_MODEL → a chat model that supports tool calling (posts 04 and 06)

# 3. check that Ollama is reachable and your model exists
npm run check:ollama

# 4. prove the setup works, without calling any model
cd 03-mcp
npm run test:offline
```

The examples use the course helper package **`@learn/shared`**: it loads the models named in `.env` (`chatModel()`, `embeddingModel()`), reads settings (`env`), and prints readable output (`section()`, `stripThinking()`). See [the `@learn/shared` guide](../shared/README.md) for every helper.

Only posts 04 and 06 call a model. Everything else is pure protocol, so you can predict every line of output.

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [What is MCP?](01-what-is-mcp/README.md) | Host, client, server, transport. A tiny server and client in one file, with every JSON-RPC message printed. |
| 2 | [Tools in depth](02-tools/README.md) | Schemas the model reads, typed results, `isError` vs invalid arguments, and annotations. |
| 3 | [Resources: context the app reads](03-resources/README.md) | Read-only data by URI, a URI template for "any patient's appointments", and when to use a resource instead of a tool. |
| 4 | [Prompts: reusable templates](04-prompts/README.md) | A "confirmation SMS" template the server owns, filled by the client and sent to a model. |
| 5 | [A real stdio server, inspected](05-stdio-server/README.md) | The full clinic server as its own process, a client that spawns it, and the MCP Inspector. |
| 6 | [An agent that uses MCP tools](06-agent-over-mcp/README.md) | The AI SDK discovers tools at runtime; the host hides destructive ones from the model. |
| 7 | [Remote MCP: HTTP and auth](07-http-and-auth/README.md) | Streamable HTTP on `node:http`, a bearer token, and a role check inside the tool. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Post 7 ends with the **week-3 exercise from the learning map**.

## Running the examples

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:07` | Run one post's example (posts 04 and 06 call your model). |
| `npm run post:04:offline` / `npm run post:06:offline` | The same without the model part. |
| `npm run post:07:serve` | Keep post 7's HTTP server running on `http://localhost:3333/mcp`. |
| `npm run inspector` | Open the MCP Inspector (a web UI) on the post 5 server. |
| `npm run test:offline` | Run every example that needs no model, to check your setup. |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

## What's in this folder

```
03-mcp/
├── README.md                ← you are here (series index)
├── 01-what-is-mcp/          README.md (the post) + example.ts (the code)
├── 02-tools/
├── 03-resources/
├── 04-prompts/
├── 05-stdio-server/         + server.ts (the full clinic MCP server), appointment-store.ts (fake backend), spawn.ts
├── 06-agent-over-mcp/
├── 07-http-and-auth/
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

`05-stdio-server/appointment-store.ts` is the fake hospital scheduling API (patients, slots, appointments) that posts 02, 03, 05, 06 and 07 all use.

**Start here → [Post 1: What is MCP?](01-what-is-mcp/README.md)**

---

**Before this lesson:** [Lesson 02 — Agents with LangGraph](../02-agents-langgraph/README.md) (agent loops, graphs, approval, handoffs).
**After this lesson:** [Lesson 04 — RAG](../04-rag/README.md) gives the agent knowledge from your documents, with citations.
