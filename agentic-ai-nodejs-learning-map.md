# Agentic AI & LLM Engineering: Node.js Learning Map

_Compiled Oct 22, 2026. Based on 25 India job postings (agentic AI, LLM, GenAI and AI platform roles) sampled May–Oct 2026._

This file is the job-market map. The course that implements it is [PLAN.md](PLAN.md) and the numbered folders. Each section splits three things:

- **Build here** — what that folder actually runs.
- **Recognize** — names that show up in postings. This repo does not implement them.
- **Your exercise** — what the week in PLAN asks you to add. It is not already done in the tree.

## 1. Foundations & structured output

Tokens, context windows, embeddings, prompting, and context engineering. Typed JSON from a model, with schemas in [Zod](https://zod.dev). The [Vercel AI SDK](https://ai-sdk.dev/docs) covers model calls, streaming, tool calling and structured output, and works with OpenAI, Anthropic, Azure, Bedrock and local models.

**Build here** (`01-foundations-structured-output`): `generateText` / `streamText`, Zod `Output.object`, a token budget with js-tiktoken, and one tool loop stopped by `stepCountIs`. Embeddings are week 4, not this folder.

**Recognize:** provider tokenizers differ. The local count is a budget, and the provider's `usage` is the bill.

**Your exercise:** PLAN week 1 — a business rule on the triage schema (violation rate over 20 runs), then a second tool that forces a two-step plan.

## 2. Agents & orchestration

[LangGraph.js](https://langchain-ai.github.io/langgraphjs/) was named in 15 of 25 postings: state graphs, checkpointing, human approval, multi-agent handoffs, retries and failure recovery. [Mastra](https://mastra.ai/docs) is the TypeScript-native alternative. [LangChain.js](https://js.langchain.com/docs/introduction/) is the loader and integration layer people mention next to it.

**Build here** (`02-agents-langgraph`): one state graph, a retry policy on a flaky tool, `interrupt()` with a SQLite checkpoint, and an explicit `recursionLimit` on the invoke config. The model is LangChain `ChatOllama`. `AI_PROVIDER` does not switch this folder.

**Recognize:** Mastra (another TS agent framework), LangChain document loaders (this course reads files with `fs`), multi-agent handoffs (`Send`, a second agent). None of those are in the tree.

**Your exercise:** PLAN week 2 — a history-summarisation node and a clarifying-question interrupt.

## 3. MCP (Model Context Protocol)

The official [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Build an MCP server (your APIs as tools) and a client. Learn tools, resources and prompts, plus transports and auth.

**Build here** (`03-mcp`): tools (annotations, `outputSchema`), a static resource, a URI template, a prompt, a raw client, and an AI SDK agent. Transport is stdio. The host hides tools whose annotations say they are destructive. A bad argument is an MCP validation error (thrown, or returned in the result). It is not a successful tool call.

**Recognize:** Streamable HTTP and bearer-token auth are in the spec and the SDK. This folder does not run them.

**Your exercise:** PLAN week 3 — HTTP transport, then a bearer token that sets the caller's role.

## 4. RAG & retrieval

Chunking, embeddings, hybrid search (keyword + vector), reranking, and citations. Storage options people hire for: [pgvector-node](https://github.com/pgvector/pgvector-node), the [Qdrant JS client](https://github.com/qdrant/qdrant-js), MongoDB Atlas Vector Search. [LlamaIndex.TS](https://ts.llamaindex.ai) is the ingestion-pipeline name.

**Build here** (`04-rag`): heading-aware chunks, `node:sqlite` vectors plus FTS5, reciprocal rank fusion, optional LLM rerank, cited answers, and refusal when the docs do not contain the answer. Re-ingest clears the file before writing, so deleted docs do not linger. Modules 05, 07 and 09 call this pipeline. The capstone does not.

**Recognize:** pgvector, Qdrant, Atlas, sqlite-vec and LlamaIndex. The store comment names the index you would swap in. None of those clients are dependencies.

**Your exercise:** PLAN week 4 — contextual chunk headers, or the same `HybridStore` interface on pgvector or sqlite-vec.

## 5. Evals & hallucination checks

[Promptfoo](https://www.promptfoo.dev/docs/intro/) is a Node CLI for test suites against prompts and agents: facts, retrieved context, a model as grader, and a non-zero exit on regressions. [Evalite](https://www.evalite.dev) is Vitest-style evals in TypeScript. [autoevals](https://github.com/braintrustdata/autoevals) ships scorers for faithfulness, relevance and more.

**Build here** (`05-evals`): a golden set, cheap code checks (`mustContain` is any-of synonyms, `mustContainAll` is every fact), a small faithfulness judge, autoevals Faithfulness and Factuality when the provider is Ollama, and a promptfoo config over the same questions. `evals:fast` exits 1 under `EVAL_THRESHOLD`. In CI that job runs only after `CI_CHAT_MODEL` and `CI_EMBED_MODEL` are set, with `RERANKER=none`. The promptfoo step is uploaded and does not fail the workflow (`continue-on-error`).

**Recognize:** Evalite. autoevals Relevance and the other scorers beyond Faithfulness and Factuality. A dead judge is not a pass: if every judge call throws, the harness exits 1.

**Your exercise:** PLAN week 5 — 10 more cases, then a table of two models by two chunk sizes.

## 6. Guardrails & fallbacks

Validate model output and tool arguments with Zod. Retry or repair when validation fails. Model fallback chains, timeouts and circuit breakers. Allow-lists for tools, and human approval before risky actions. Security testing with [Promptfoo red-team mode](https://www.promptfoo.dev/docs/red-team/), guided by the [OWASP Top 10 for LLM apps](https://genai.owasp.org/llm-top-10/). Node has no direct equivalent of Python's NeMo Guardrails, so more of this layer is yours to build.

**Build here** (`06-guardrails`): Zod validate-and-repair, per-attempt timeouts, a circuit breaker, a fallback chain (`maxRetries: 0` so one failure is visible), role allow-lists, argument checks that approve or deny, PII redaction, and promptfoo configs. This folder does not pause for a human. Durable approval is module 02. `providers/guarded-agent.ts` is a thinner target than `03-tool-allowlist.ts` (one read tool, no allow-list).

**Recognize:** NeMo Guardrails. Returning `'user-approval'` from the AI SDK and waiting on a UI.

**Your exercise:** PLAN week 6 — an indirect-injection case (payload inside a tool result) and a map from each control to an OWASP item.

## 7. Observability & cost

[Langfuse](https://langfuse.com/docs) JS SDK: traces, prompt versions and scores. [OpenLLMetry-JS](https://github.com/traceloop/openllmetry-js) on [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/), following the [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). Track tokens, latency and cost per request. Response caching, and routing between cheap and expensive models.

**Build here** (`07-observability`): hand-written `gen_ai.*` spans, AI SDK telemetry via `@ai-sdk/otel`, a parent span with token totals and `app.cost_usd` (0 until `PRICE_PER_MTOK_IN` / `PRICE_PER_MTOK_OUT` are set), and a RAG trace. `TRACE_EXPORTER` is `console` (default), `console-raw`, `otlp` (Jaeger), `langfuse` or `memory`. Prompt and response capture is off unless `OTEL_CAPTURE_CONTENT=true`.

**Recognize:** OpenLLMetry (this course writes the attributes and uses `@ai-sdk/otel` instead). Langfuse prompt versions and scores (only the span processor is wired). Caching and cheap/expensive routing are module 08, not this one.

**Your exercise:** PLAN week 7 — a token-usage histogram and p95 latency per model, plus one Langfuse run.

## 8. Cloud AI platform (pick one)

Azure OpenAI / AI Foundry was named most often (8 of 25). AWS Bedrock (4) and Vertex (3) came next. The AI SDK has providers for Azure and Bedrock.

**Build here** (`08-cloud` and `shared/src/models.ts`): `AI_PROVIDER=ollama|azure|bedrock|openai-compatible`. The gateway script adds aliases, an exact-match cache whose key already includes `params.tools`, a cost ledger, and a keyword router. Azure uses an API key. Bedrock uses the default AWS credential chain.

**Recognize:** Vertex AI. Entra ID / managed identity and Bedrock `fromNodeProviderChain()` are the production auth paths. LiteLLM is the out-of-process version of the gateway.

**Your exercise:** PLAN week 8 — a 429 that falls over to the other alias. Do not re-add tool definitions to the cache key; they are already there.

## 9. Deployment

Agents run as services on Kubernetes. CI runs an eval suite on every change once you turn it on.

**Build here** (`09-deployment`): a `node:http` RAG service, a non-root image, probes, a hardened Deployment, HPA and PDB. `/healthz` is the process. `/readyz` is the index plus, for Ollama, both named models in `/api/tags`; for Azure, resource name and API key; for Bedrock, a region; for an OpenAI-compatible server, a base URL. A request timeout aborts the model call. CI `checks` always runs typecheck, offline tests and kubeconform. CI `evals` is skipped until `CI_CHAT_MODEL` and `CI_EMBED_MODEL` exist; then `evals:fast` is the hard gate. Promptfoo does not fail the build. The image job builds with `push: false` and does not publish a registry tag. The manifests run this RAG API, not the capstone agent.

**Recognize:** KEDA and custom metrics (the CPU HPA is the weak signal the README calls out).

**Your exercise:** PLAN week 9 — set the two CI variables, break a prompt and watch `evals:fast` fail, then scale on in-flight requests.

## Portfolio project

The posting-shaped project is a LangGraph.js healthcare agent that reads HIS/FHIR through an MCP server, uses Zod guardrails, fails CI on Promptfoo hallucination tests, and is traced with Langfuse and OpenTelemetry.

**What week 10 ships** (`10-capstone`): an AI SDK tool loop over a FHIR-shaped MCP server, Zod on tool inputs, host allow-lists, `--approve` for writes (decided before the call, not a durable interrupt), PII redaction, an output guard, a custom eval script, and the same `TRACE_EXPORTER` switch as module 07. The workflow in module 09 does not run this eval script.

**Your exercise (week 11):** port approvals to LangGraph `interrupt()`, point the module 06 red-team config at `createAgent`, serve it from module 09, and grow the eval set. Those are listed in [10-capstone/README.md](10-capstone/README.md). Finishing week 10 is not that portfolio sentence yet.

## Certifications

None of the 25 postings required a certification. Only 2 listed one as "preferred" (Wipro, Nagarro). If you want one, match it to your target cloud, and take it after the projects:

- [Azure AI Apps and Agents Developer Associate (AI-103)](https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-apps-and-agents-developer-associate/). Replaced AI-102, which retired in June 2026.
- [AWS Certified Generative AI Developer – Professional](https://aws.amazon.com/certification/certified-generative-ai-developer-professional/), US$300.
- [Databricks Generative AI Engineer Associate](https://www.databricks.com/learn/certification/genai-engineer-associate), US$200.

## Trade-off to remember

19 of 25 postings asked for Python. Going Node-only narrows you to TypeScript-first and "Python or Java/TS" roles (about 6 of 25). Strong shipped projects need to carry more of the weight.
