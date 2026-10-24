# Learning plan: agentic AI engineering in Node.js / TypeScript

**Assumptions:**
- About 8–10 hours a week for 12 weeks (~100 h).
- You're already an experienced Node/TS engineer, so no JS basics.
- Each week is roughly 2–3 h reading, 4–5 h running and modifying the example, and 1–2 h on the extension exercise and notes.
- **10-week option:** merge weeks 8 + 9 and skip week 12.

Each week maps to one topic of the [learning map](agentic-ai-nodejs-learning-map.md) and one lesson folder here. Set up once with [README.md](README.md). `npm run typecheck && npm run test:offline` should be green before you start.

## Progress
- [ ] Week 1 · Foundations: model calls, structured output, tokens, tools (`01-foundations-structured-output`)
- [ ] Week 2 · Agents & orchestration with LangGraph.js (`02-agents-langgraph`)
- [ ] Week 3 · Model Context Protocol (`03-mcp`)
- [ ] Week 4 · RAG: retrieval that actually works (`04-rag`)
- [ ] Week 5 · Evals (`05-evals`)
- [ ] Week 6 · Guardrails, reliability & security (`06-guardrails`)
- [ ] Week 7 · Observability with OpenTelemetry (`07-observability`)
- [ ] Week 8 · Cloud models & LLM gateways (`08-cloud`)
- [ ] Week 9 · Deployment: container, Kubernetes, CI eval gates (`09-deployment`)
- [ ] Week 10 · Capstone part 1: build & understand (`10-capstone`)
- [ ] Week 11 · Capstone part 2: harden, evaluate, extend (`10-capstone`)
- [ ] Week 12 · Portfolio & buffer

---

## Week 1 · Foundations: model calls, structured output, tokens, tools
**Goal:** treat the LLM as an unreliable, typed function. Get typed JSON out of it, know what a token costs, and understand the tool-calling loop every agent framework is built on.

**Read:**
- [AI SDK introduction](https://ai-sdk.dev/docs/introduction)
- [Generating text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
- [Structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [Tools & tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Zod API](https://zod.dev/api)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [tiktoken](https://github.com/openai/tiktoken)

**Read + run:** `01-foundations-structured-output`. Start with its [README](01-foundations-structured-output/README.md), the series index, and read post 00 plus the 8 blog posts in order. Each post (`NN-topic/README.md`) explains the concept, walks through its `example.ts`, and tells you how to run it (`npm run post:NN`).

**Extension:** add a business rule to the triage schema and measure the violation rate over 20 runs. Then add a second tool and force a two-step plan.

**Done when:**
- [ ] You can explain constrained decoding vs. post-hoc validation, and what happens on `NoObjectGeneratedError`.
- [ ] You can draw the tool loop (model → tool call → your code → tool result → model) and say where `stopWhen` cuts it.
- [ ] You know why token counts differ per model and per language (Arabic vs. English, JSON).
- [ ] The extension runs and you've written down the violation rate.

## Week 2 · Agents & orchestration with LangGraph.js
**Goal:** build agents as explicit state machines (not prompt spaghetti), with retries, step limits and human approval that survives restarts.

**Read:**
- [Building effective agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents)
- [LangGraph.js overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [AI SDK agents](https://ai-sdk.dev/docs/agents/overview) and [loop control](https://ai-sdk.dev/docs/agents/loop-control), for comparison

**Read + run:** [`02-agents-langgraph`](02-agents-langgraph/README.md), posts 01–08 in order (`npm run post:NN -w 02-agents-langgraph`). The key ones: [post 03, the agent graph](02-agents-langgraph/03-agent-graph/README.md) and [post 07, human approval](02-agents-langgraph/07-human-approval/README.md) (`post:07`, then `post:07:resume` or `post:07:reject`).

**Extension:** a history-summarisation node, plus a "clarifying question" interrupt.

**Done when:**
- [ ] You can say when you'd pick a LangGraph graph vs. a plain AI SDK tool loop.
- [ ] You've killed the process mid-approval and resumed it from the checkpoint by `thread_id`.
- [ ] You can show where the retry policy and the recursion / step limit live.

## Week 3 · Model Context Protocol
**Goal:** expose capabilities as an MCP server and consume them from an agent, keeping least privilege on the **host** side.

**Read:**
- [MCP intro](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [Server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [Spec: tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [Spec: resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- [Spec: authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [AI SDK MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [Inspector](https://modelcontextprotocol.io/docs/tools/inspector)

**Read + run:** [`03-mcp`](03-mcp/README.md), posts 01–07. [Post 05](03-mcp/05-stdio-server/README.md) talks to the server with no LLM; [post 06](03-mcp/06-agent-over-mcp/README.md) lets an agent use it; optionally `npm run inspector -w 03-mcp` opens the MCP Inspector.

**Extension:** a Streamable HTTP transport, plus bearer-token auth that derives the caller's role.

**Done when:**
- [ ] You can explain tools vs. resources vs. prompts, and who (model, app or user) controls each.
- [ ] You know tool annotations are *hints*: the host must enforce them.
- [ ] Your server works over both stdio and HTTP.

## Week 4 · RAG
**Goal:** retrieval good enough to trust: chunking, hybrid search, reranking, grounded answers with checkable citations, and refusal when the answer isn't there.

**Read:**
- [AI SDK embeddings](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)
- [Contextual retrieval (Anthropic)](https://www.anthropic.com/research/contextual-retrieval)
- [SQLite FTS5 / BM25](https://www.sqlite.org/fts5.html)
- [node:sqlite](https://nodejs.org/api/sqlite.html)

**Read + run:** [`04-rag`](04-rag/README.md), posts 01–08. Then the [full pipeline (post 08)](04-rag/08-full-pipeline/README.md): `npm run ingest -w 04-rag`, `search` (compare vector / keyword / hybrid), `ask` (with `RERANKER=llm` and `none`).

**Extension:** contextual chunk headers, or move the store to pgvector / sqlite-vec behind the same interface.

**Done when:**
- [ ] You can explain why hybrid (BM25 + vectors with RRF) beats either alone on ids, drug names and codes.
- [ ] You can explain recall (retrieve) vs. precision (rerank) and what each costs in latency.
- [ ] The "parking fee" question is refused rather than hallucinated.
- [ ] `npm run test:offline -w 04-rag` is green after your changes.

## Week 5 · Evals
**Goal:** replace "looks good to me" with numbers. Use a golden dataset and layered metrics (cheap code checks first, LLM judges last) to gate changes.

**Read:**
- [Your AI product needs evals (Hamel Husain)](https://hamel.dev/blog/posts/evals/)
- [RAGAS faithfulness](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/)
- [autoevals](https://github.com/braintrustdata/autoevals)
- [promptfoo intro](https://www.promptfoo.dev/docs/intro/)
- [promptfoo assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/)
- [promptfoo custom providers](https://www.promptfoo.dev/docs/providers/custom-api/)
- [AI SDK testing (mock models)](https://ai-sdk.dev/docs/ai-sdk-core/testing)

**Read + run:** [`05-evals`](05-evals/README.md), posts 01–07. Then `npm run evals:fast -w 05-evals`, `evals` ([post 06](05-evals/06-eval-harness-and-gate/README.md)) and `promptfoo` ([post 07](05-evals/07-promptfoo/README.md)).

**Extension:** add 10 realistic cases. Then compare two models and two chunk sizes, and record the results in a table.

**Done when:**
- [ ] You can name which failures code metrics catch and which need a judge, and why judges need their own spot-checks.
- [ ] The eval exits non-zero below the threshold, and you've seen it fail.
- [ ] You have a results table comparing at least two configurations.

## Week 6 · Guardrails, reliability & security
**Goal:** assume the model will be wrong, slow, down, or manipulated, and design so that it's survivable.

**Read:**
- [OWASP Top 10 for LLM apps](https://genai.owasp.org/llm-top-10/)
- [LLM01 prompt injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [promptfoo red-team quickstart](https://www.promptfoo.dev/docs/red-team/quickstart/)
- [promptfoo plugins](https://www.promptfoo.dev/docs/red-team/plugins/)
- [promptfoo strategies](https://www.promptfoo.dev/docs/red-team/strategies/)

**Run:**
- [`06-guardrails`](06-guardrails/README.md): posts 01–09 in order (`npm run post:NN -w 06-guardrails`; most have a `post:NN:offline` version)
- [Post 10, red-teaming](06-guardrails/10-red-teaming/README.md): `redteam:static`, then `redteam` (local-only generation; read the comments for which plugins need promptfoo's remote generation)

**Extension:** an indirect-injection test (payload inside a tool result), and map each control to OWASP items.

**Done when:**
- [ ] You can explain why authorization belongs in the host or tool layer, not the prompt.
- [ ] The fallback chain recovers from a broken model id, and the circuit breaker opens.
- [ ] You've triaged every red-team failure as a real issue or judge noise.

## Week 7 · Observability
**Goal:** see every model call, tool call and retrieval step of a request as a trace, using the standard GenAI semantic conventions, with cost and quality signals attached.

**Read:**
- [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [Agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [OTel JS](https://opentelemetry.io/docs/languages/js/)
- [JS instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [AI SDK telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)
- [Jaeger getting started](https://www.jaegertracing.io/docs/latest/getting-started/)
- [Langfuse observability](https://langfuse.com/docs/observability/overview)
- [Langfuse + AI SDK](https://langfuse.com/integrations/frameworks/vercel-ai-sdk)

**Read + run:** [`07-observability`](07-observability/README.md), posts 01–06. The scripts `manual` (post 02), `ai-sdk` (post 03) and `rag` (post 05) run the main examples. Then `TRACE_EXPORTER=otlp` with Jaeger (`npm run jaeger -w 07-observability`, [post 06](07-observability/06-backends-jaeger-and-langfuse/README.md)).

**Extension:** a token-usage histogram metric and p95 latency per model, plus a Langfuse run.

**Done when:**
- [ ] You can read a trace and say where the latency went (embed vs. search vs. rerank vs. generation).
- [ ] You know which `gen_ai.*` attributes are required, and why prompt / response capture is opt-in (PII).
- [ ] Your request span carries business context (user / tenant / feature) and cost.

## Week 8 · Cloud models & LLM gateways
**Goal:** run the same code on Azure OpenAI or Bedrock by changing config only, and put a gateway layer (aliases, cache, cost ledger, routing) in front of models.

**Read:**
- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [Middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware)
- [Azure provider](https://ai-sdk.dev/providers/ai-sdk-providers/azure)
- [Bedrock provider](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock)
- [OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Azure OpenAI + Entra ID](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/managed-identity)
- [Bedrock overview](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html)
- [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html)
- [LiteLLM](https://docs.litellm.ai/docs/)

**Read + run:** [`08-cloud`](08-cloud/README.md), posts 01–08. `npm run swap -w 08-cloud -- --dry` for each provider ([post 01](08-cloud/01-provider-abstraction/README.md)), then `gateway` ([post 08](08-cloud/08-routing-cheap-vs-expensive/README.md)). If you have an Azure or AWS account, do one real cloud run (keys: [GETTING-API-KEYS.md](GETTING-API-KEYS.md)).

**Extension:** a 429 → fallback-alias middleware; cache keys that include tool definitions.

**Done when:**
- [ ] Switching providers is a `.env` change only, and you've proven it at least with `--dry`.
- [ ] You can explain Azure deployments vs. models, Entra ID vs. API keys, and Bedrock model access and inference profiles.
- [ ] You can argue in-process middleware vs. a central gateway (LiteLLM) for a team.

## Week 9 · Deployment
**Goal:** ship an LLM service the way you'd ship any critical Node service, plus LLM specifics: load shedding, timeouts, readiness tied to the model backend, and evals as a CI gate.

**Read:**
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [K8s Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
- [HPA](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers)
- [Variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
- [promptfoo GitHub Action](https://www.promptfoo.dev/docs/integrations/github-action/)

**Run:**
1. [`09-deployment`](09-deployment/README.md), posts 01–09. In [post 06](09-deployment/06-the-rag-service/README.md): the smoke test (`npm run post:06:offline -w 09-deployment`), then `npm start -w 09-deployment` + curl.
2. `docker build` / `run` ([post 07](09-deployment/07-container-image/README.md)).
3. `kubectl apply` on a local cluster ([post 08](09-deployment/08-kubernetes/README.md)) (kind, minikube or Docker Desktop).
4. Push to a GitHub repo to watch CI.
5. Set `CI_CHAT_MODEL` / `CI_EMBED_MODEL` repo variables to enable the eval job ([post 09](09-deployment/09-ci-eval-gate/README.md)).

**Extension:** autoscale on in-flight requests (KEDA / custom metric); publish the image tagged with the git SHA.

**Done when:**
- [ ] The container runs as non-root with a read-only root FS, and passes readiness.
- [ ] A rolling restart under load drops no requests (graceful drain).
- [ ] A deliberately broken prompt makes the CI eval gate fail.

## Week 10 · Capstone part 1: build & understand
**Goal:** read and run the full system: an MCP-backed clinical-scheduling agent with role allow-lists, host authorization, write approvals, PII redaction, output guards and tracing.

**Read:**
- [FHIR R4](https://hl7.org/fhir/R4/)
- [Patient](https://hl7.org/fhir/R4/patient.html)
- [AllergyIntolerance](https://hl7.org/fhir/R4/allergyintolerance.html)
- [MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html)
- [Slot](https://hl7.org/fhir/R4/slot.html)
- [Appointment](https://hl7.org/fhir/R4/appointment.html)
- [SMART on FHIR](https://docs.smarthealthit.org/)
- Re-read the MCP security best practices and AI SDK tool approvals (week 3 links)

**Read + run:** [`10-capstone`](10-capstone/README.md), posts 01–08:
- `npm run test:offline -w 10-capstone`
- every `ask` example in [post 06](10-capstone/06-the-agent/README.md) (with and without `--approve`, both roles)
- traces in Jaeger ([post 07](10-capstone/07-tracing-the-agent/README.md))

**Extension:** add a `reschedule_appointment` tool end to end (store → MCP tool with annotations → role allow-list → approval → eval case).

**Done when:**
- [ ] You can trace one request through every guard layer and name which layer stops each attack.
- [ ] `reschedule_appointment` works, and is denied without approval.

## Week 11 · Capstone part 2: harden, evaluate, extend
**Goal:** make it measurable and production-shaped.

**Run:** `npm run evals -w 10-capstone` ([post 08](10-capstone/08-agent-evals/README.md)) with two different `CHAT_MODEL`s; compare `output/agent-evals.json`.

**Extension (pick two):**
- Port it to LangGraph with `interrupt()` approvals.
- Point the 06 red-team config at the agent.
- Serve it through 09's HTTP app and k8s manifests.
- Swap the store for a public HAPI FHIR test server.

**Done when:**
- [ ] The eval set has ≥ 12 cases, including every bug you found in live runs.
- [ ] There are zero safety failures across both models, and the pass rate is recorded per model.
- [ ] The two chosen extensions are done.

## Week 12 · Portfolio & buffer
**Goal:** turn this into evidence.
- Catch up on any unchecked boxes.
- Write a 1-page architecture note for the capstone: threat model, eval results, trace screenshots, cost per request.
- Publish the repo (without `.env`) with CI green.

**Done when:**
- [ ] The repo is public or shareable, with CI green.
- [ ] The write-up exists, with numbers (eval pass rate, p95 latency, tokens per request).
- [ ] You can demo the capstone live in 10 minutes, including one blocked attack and one approved write.
