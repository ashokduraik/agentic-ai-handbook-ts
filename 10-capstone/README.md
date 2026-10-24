# Lesson 10 — Capstone: a guarded clinical-scheduling agent, a blog series

**Everything from lessons 01–09 in one small system: a hospital front-desk and clinician assistant that reads a FHIR-shaped patient store only through an MCP server, wrapped in least privilege, host-side authorization, human approval for writes, PII redaction, output guardrails, tracing and evals. 8 short posts.**

A receptionist types "Book Fatima Al-Harbi the earliest cardiology slot for a blood-pressure follow-up." Behind that sentence, the assistant has to find the right patient, find a free slot, and book it, without ever touching a patient outside this user's care team, leaking a national ID, giving dosing advice, or booking anything a person didn't approve.

The lesson that runs through all 8 posts: **the model is not the security boundary.** The model decides *what to try*. Your code decides *what is allowed*. Every rule that matters is enforced outside the model, so it holds even when a small model invents an id or a user tries a prompt injection.

All patient data is fictional.

Each post starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file. Read them in order: each post builds a piece the next one uses.

## What you will be able to do

This lesson is the **Portfolio project** section of the learning map (`agentic-ai-nodejs-learning-map.md`), the week-10 build. In plain words, the goal is:

> **Build a tool-using healthcare agent that is safe by construction: tools over MCP with compact outputs, least privilege per role, authorization in the host and the server, human approval for writes, redaction and output rules, a trace of every step, and evals that check what actually happened.**

After the 8 posts you should be able to:

1. **Model clinic data as FHIR-shaped resources** and return compact projections instead of raw records.
2. **Expose that data through an MCP server** with tool annotations, a resource, and its own authorization check.
3. **Guard the edges**: an input guard, PII redaction, and a domain output rule.
4. **Enforce least privilege and authorization in the host**: per-role tool lists and a care-team check before every call.
5. **Require human approval for write tools**, and check the store instead of trusting the answer.
6. **Assemble the agent** with an AI SDK tool loop and hard limits, and test it end to end without a model.
7. **Trace the agent**, so each request shows every model call and tool call with its tokens and timing.
8. **Evaluate the agent on behaviour**: trajectory, real outcome, safety and answer, with safety failures gated separately.

## Set up once (5 minutes)

If you did lesson 01, you are already set up. This lesson uses lesson 07's tracing setup and fake models (`@learn/07-observability`).

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models come from .env only (CHAT_MODEL). Pick a model that supports tool calling.
#    Optional: TRACE_EXPORTER=otlp|langfuse  EVAL_THRESHOLD=0.7
npm run check:ollama

# 3. prove the setup works, without calling any model
cd 10-capstone
npm run test:offline
```

The examples import a few small helpers (`chatModel()`, `section()` and friends) from the course helper package `@learn/shared`. [What each helper does](../shared/README.md).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [The FHIR-shaped data](01-the-fhir-data/README.md) | FHIR resources and references, and why tools return small projections. |
| 2 | [The MCP server](02-the-mcp-server/README.md) | Six tools with read-only/destructive annotations, a resource, and a server-side care-team check. |
| 3 | [Three guards](03-guards/README.md) | An input guard, PII redaction and a no-dosing-advice output rule, and what regexes miss. |
| 4 | [Least privilege, outside the model](04-least-privilege/README.md) | Per-role tool lists, a host-side care-team check, and redaction before the model sees anything. |
| 5 | [Human approval for writes](05-human-approval/README.md) | `toolApproval` from tool annotations, and checking the store instead of the answer. |
| 6 | [The agent](06-the-agent/README.md) | Posts 01–05 around one tool loop with hard limits, tested end to end with a scripted model. |
| 7 | [Tracing the agent](07-tracing-the-agent/README.md) | One request as a tree: our span, model calls, tool calls, tokens and timings. |
| 8 | [Evals for an agent](08-agent-evals/README.md) | Scoring trajectory, outcome, safety and answer, with an exit code CI can gate on. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:08` | Run one post's example (posts 05–08 call your model). |
| `npm run post:05:offline` … `post:08:offline` | The same with a scripted model (posts 01–04 never need a model). |
| `npm run ask -- [--role clinician] [--approve] "<request>"` | Ask the agent anything (same as `npm run post:06 -- …`). |
| `npm run evals [-- <case id>]` | Run the agent evals against your model (same as `npm run post:08`). |
| `npm run test:offline` | Run every offline example (CI runs this). |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

The session is fixed to user `staff-17` with care team `[P-001, P-003]`. Patient `P-002` (Rahul Menon) is deliberately outside it.

## What's in this folder

```
10-capstone/
├── README.md                    ← you are here (series index)
├── 01-the-fhir-data/            README.md (the post) + example.ts (the code) + fhir-store.ts (the data)
├── 02-the-mcp-server/           + fhir-mcp-server.ts (the server) and connect.ts (start + connect)
├── 03-guards/                   + guards.ts
├── 04-least-privilege/          + access.ts (role tool lists, wrapTool)
├── 05-human-approval/           + approval.ts
├── 06-the-agent/                + agent.ts (createAgent)
├── 07-tracing-the-agent/
├── 08-agent-evals/              + dataset.ts (the eval cases)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

## Where to go next (week 11)

Finishing these posts is not yet the portfolio project in the learning map (a LangGraph.js agent with Promptfoo-gated CI and Langfuse). These exercises close the gap:

1. **Real human-in-the-loop:** port the agent to LangGraph ([lesson 02](../02-agents-langgraph/README.md)), so a write tool raises `interrupt()`, saves to the SQLite checkpointer, and continues after a person approves in another process. Or use the AI SDK's `'user-approval'` status and show the pending `tool-approval-request` in a UI.
2. **Red-team it:** point the promptfoo red-team setup from [lesson 06](../06-guardrails/README.md) at `createAgent`, and add a `policy` plugin: "never disclose data for patients outside the caller's care team".
3. **Serve it:** put `createAgent` behind [lesson 09](../09-deployment/README.md)'s `createApp` (one MCP child per pod, the session from a JWT), and reuse the Dockerfile and manifests.
4. **Real FHIR:** replace `fhir-store.ts` with calls to a public HAPI FHIR test server, using SMART-on-FHIR scopes (`patient/*.read`) as the source of authorization.
5. **Grow the evals:** add a case for every bug you hit in live runs, and compare pass rates per model in `output/agent-evals.json`.

Further reading: [MCP spec: tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) · [AI SDK MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) · [AI SDK tool approvals](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) · [FHIR R4 Patient](https://hl7.org/fhir/R4/patient.html) · [AllergyIntolerance](https://hl7.org/fhir/R4/allergyintolerance.html) · [Appointment](https://hl7.org/fhir/R4/appointment.html) · [SMART on FHIR](https://docs.smarthealthit.org/)

**Start here → [Post 1: The FHIR-shaped data](01-the-fhir-data/README.md)**

**Before this lesson:** [Lesson 09 — Deployment](../09-deployment/README.md) turned the RAG pipeline into a production service. **After this lesson:** you've finished the course. Go back to the [course home](../README.md) and pick a week-11 exercise above.
