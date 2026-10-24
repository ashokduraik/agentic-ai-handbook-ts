# Lesson 06 — Guardrails & fallbacks: a blog series

**Assume the model will be wrong, slow, down, or manipulated, and build so that it doesn't matter. 10 short posts.**

Until now we trusted the model a little: we asked for JSON and used it, gave it tools and let it call them. In production that is how incidents start. A small model invents a dose. A provider returns 503 for ten minutes. A referral letter contains a hidden instruction. A receptionist's chat ends up calling a delete tool.

This series builds the layer between the model and your systems, one idea per post. Each post starts with a real problem, explains the idea in plain English, then walks through a small runnable TypeScript file.

Read the posts in order. Each one builds on the one before it.

## What you will be able to do

This lesson covers **Topic 6** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Check everything the model produces (answers and tool arguments) with Zod and repair it when it's wrong. Keep the service up when a model is slow or down (timeouts, retries, circuit breakers, fallback chains). Limit what an agent is allowed to do (tool allow-lists, authorization, approval before risky actions). Then attack your own assistant with promptfoo, using the OWASP Top 10 for LLM apps as the checklist.**

After the 10 posts you should be able to:

1. **Name the main LLM risks** (OWASP LLM Top 10), and show a prompt injection working, direct and indirect.
2. **Validate model output** in two layers (shape and business rules), **repair** it, and **fail closed**.
3. **Validate tool arguments** so bad input never reaches your API.
4. **Survive slow and failing models** with timeouts, retries, a circuit breaker and a fallback chain.
5. **Apply least privilege**: per-role tool allow-lists, authorization inside tools, and approve/deny/ask-a-human policies.
6. **Add cheap input and output guards**, and explain why they are not the real security boundary.
7. **Red-team your assistant** with a hand-written promptfoo suite and promptfoo's generated attacks.

Node has no direct equivalent of Python's NeMo Guardrails, so you build more of this layer yourself. That is a good thing: every guard here is plain TypeScript you can read and test.

## Set up once (5 minutes)

If you did lesson 01, you are already set up.

```bash
# 1. at the repo root (agentic-ai-handbook-ts/)
npm install

# 2. models come from .env only (no code names a model)
#    CHAT_MODEL      → a chat model that supports tool calling
#    FALLBACK_MODEL  → optional second model; post 06 falls back to it
#    JUDGE_MODEL     → optional; the model promptfoo uses to write and grade attacks (post 10)
npm run check:ollama

# 3. prove the setup works, without calling any model
cd 06-guardrails
npm run test:offline
```

The examples import a few small helpers (`chatModel()`, `section()` and friends) from the course helper package `@learn/shared`. [What each helper does](../shared/README.md).

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [What can go wrong: prompt injection and the OWASP Top 10](01-threats-and-owasp/README.md) | A referral letter with a hidden comment takes over your summariser. The threat map for the rest of the lesson. |
| 2 | [Validate every answer, and repair instead of failing](02-validate-and-repair/README.md) | Shape checks, business rules, a repair loop, and failing closed when the model can't get it right. |
| 3 | [Check the model's tool arguments](03-tool-argument-checks/README.md) | A strict `inputSchema` stops `patientId: "Fatima"` and 365-day refills before your code runs. |
| 4 | [Timeouts and retries](04-timeouts-and-retries/README.md) | Budgets that really cancel the call, and what `maxRetries` does for you. |
| 5 | [The circuit breaker](05-circuit-breaker/README.md) | Stop hammering a model that is down. Closed, open, half-open. |
| 6 | [The fallback chain](06-fallback-chain/README.md) | Broken model → CHAT_MODEL → FALLBACK_MODEL, with one clear error when all fail. |
| 7 | [Least privilege: tool allow-lists and authorization](07-tool-allow-lists/README.md) | The receptionist's agent can't even see `deleteRecord`, and no agent can read a patient outside the care team. |
| 8 | [Approval policies: approve, deny, or ask a human](08-approval-policies/README.md) | Deterministic rules on the actual arguments, and a pause for a human before a cancellation. |
| 9 | [Input and output guards](09-input-and-output-guards/README.md) | Block obvious injections, redact national ids and phones, stop dosing advice. And their limits. |
| 10 | [Red-teaming with promptfoo](10-red-teaming/README.md) | Attack your assistant with a regression suite and generated attacks, graded by a judge model. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Budget about one evening per two posts.

## Running the examples

Every post's folder has one `example.ts`. From this folder:

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:10` | Run one post's example (calls your models). |
| `npm run post:01:offline` … `npm run post:08:offline` | Run only the part that needs no model (post 09 never needs one). |
| `npm run test:offline` | Run every offline part, to check your setup (about 20 s, post 04 waits on real retry backoff). |
| `npm run redteam:static` | Post 10: the hand-written promptfoo attack suite against your model. |
| `npm run redteam` | Post 10: promptfoo generates and grades attacks (slow; writes `10-red-teaming/redteam.generated.yaml`). |
| `npm run typecheck` | Type-check all examples. |
| `npm run check:links` | Check that every link in these posts points to a real file. |

## What's in this folder

```
06-guardrails/
├── README.md                          ← you are here (series index)
├── 01-threats-and-owasp/              README.md (the post) + example.ts (the code)
├── 02-validate-and-repair/
├── 03-tool-argument-checks/
├── 04-timeouts-and-retries/
├── 05-circuit-breaker/                example.ts also exports CircuitBreaker (used by post 06)
├── 06-fallback-chain/
├── 07-tool-allow-lists/
├── 08-approval-policies/
├── 09-input-and-output-guards/        example.ts also exports the guards (used by post 10)
├── 10-red-teaming/                    + promptfooconfig.injection.yaml, promptfooconfig.redteam.yaml, judge-provider.ts
├── support/mock-models.ts             fake models so the offline parts run without Ollama
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

**Start here → [Post 1: What can go wrong: prompt injection and the OWASP Top 10](01-threats-and-owasp/README.md)**

**Before this lesson:** [Lesson 05 — Evals](../05-evals/README.md) taught you to measure quality. **After this lesson:** [Lesson 07 — Observability & cost](../07-observability/README.md) makes every guard, retry and fallback visible in a trace.
