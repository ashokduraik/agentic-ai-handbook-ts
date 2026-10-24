# Post 02 · The GenAI semantic conventions

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 2 of 6 · about 30 minutes*

> Three teams in the hospital trace their AI features. One records `model`, one `llm_name`, one `ai.model.id`. The platform team wants one dashboard of tokens per model across all three. It takes a week of mapping field names, and breaks again when a fourth team joins.
>
> Standard names fix this. OpenTelemetry has them for LLM calls, and this post writes a model-call span by hand using them.

---

## The idea, in plain English

### Semantic conventions = agreed names

OpenTelemetry's **semantic conventions** are agreed attribute names, so every tool understands every app. HTTP spans use `http.request.method`; database spans use `db.system.name`. For LLM calls there are the **GenAI semantic conventions** (`gen_ai.*`). They are still marked "development", so names can change, but backends already understand them.

The ones you'll use most:

| Attribute | Example | Meaning |
|---|---|---|
| `gen_ai.operation.name` | `chat` | What kind of call (`chat`, `embeddings`, `execute_tool`, `invoke_agent`) |
| `gen_ai.provider.name` | `ollama` | Who serves the model |
| `gen_ai.request.model` | `qwen3:0.6b` | The model you asked for |
| `gen_ai.request.max_tokens`, `gen_ai.request.temperature` | `256`, `0` | The settings you sent |
| `gen_ai.response.finish_reasons` | `["stop"]` | Why it stopped (`stop`, `length`, `tool-calls`) |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` | `31`, `17` | Tokens used: the basis of cost |
| `error.type` | `AI_APICallError` | Set when the call failed |

The span **name** is `"{operation} {model}"`, for example `chat qwen3:0.6b`, and its **kind** is `CLIENT`, because you are calling a remote service.

### Prompts and answers are opt-in

The conventions also define `gen_ai.input.messages` and `gen_ai.output.messages` for the actual text. In healthcare that text is often **PHI**, and traces are usually kept longer and shown to more people than your database. So the rule is: **content capture is off by default**, and you turn it on deliberately (here with `OTEL_CAPTURE_CONTENT=true`), ideally only in development or with redaction ([lesson 06, post 09](../../06-guardrails/09-input-and-output-guards/README.md)).

### Why do it by hand?

In the next post the AI SDK writes these spans for you. Doing it once yourself shows you exactly what those spans contain, and how to trace a model call that doesn't go through the AI SDK. (Libraries such as OpenLLMetry auto-instrument other SDKs the same way.)

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** traces a successful call; part **B** traces a failing one.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — name, kind and request attributes

```ts
  return tracer.startActiveSpan(
    `chat ${modelName}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_PROVIDER_NAME]: offline ? 'mock' : env.provider,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelName,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: maxTokens,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: temperature,
      },
    },
```

The `ATTR_GEN_AI_*` constants come from `@opentelemetry/semantic-conventions/incubating`, so you can't misspell a name. What we *asked for* is known before the call, so it goes on at the start.

### Step 2 — response attributes

```ts
        const r = await generateText({ model, prompt, maxOutputTokens: maxTokens, temperature, telemetry: { isEnabled: false } }); // we write the span ourselves here; post 03 lets the SDK do it
        span.setAttributes({
          [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [r.finishReason],
          [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: r.usage.inputTokens ?? 0,
          [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: r.usage.outputTokens ?? 0,
        });
```

What *happened* (finish reason, token usage) is added after the call.

### Step 3 — content, only when allowed

```ts
const captureContent = optional('OTEL_CAPTURE_CONTENT') === 'true'; // off by default: prompts can contain PHI
```

```ts
        if (captureContent) span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: prompt }] }]));
```

The messages are stored as JSON, in the conventions' `role` + `parts` shape.

### Step 4 — failures

```ts
        // Errors: set error.type + status so dashboards can count failures per model.
        span.recordException(e as Error);
        span.setAttribute(ATTR_ERROR_TYPE, (e as Error).name ?? 'Error');
        span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
        throw e;
```

Three things: the exception (with stack trace) as a span event, `error.type` for grouping, and the ERROR status. Then re-throw: tracing records errors, it doesn't swallow them.

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:02:offline   # a fake model
npm run post:02           # your CHAT_MODEL
OTEL_CAPTURE_CONTENT=true TRACE_EXPORTER=console-raw npm run post:02   # see the prompt + answer on the span
# or: npx tsx 02-genai-semantic-conventions/example.ts [--offline]
```

### What you should see

- **A**: `[span] chat qwen3:0.6b (553 ms) operation.name="chat" provider.name="ollama" request.model="qwen3:0.6b" response.finish_reasons=["stop"] usage.input_tokens=31 usage.output_tokens=17`, then the answer.
- **B**: `[span] chat this-model-does-not-exist (24 ms) ❌ … error.type="AI_APICallError"`, then `caught: Not Found`.
- With `OTEL_CAPTURE_CONTENT=true` and `console-raw`, the span also has `gen_ai.input.messages` and `gen_ai.output.messages`.

## Common gotchas

- ❌ **Inventing your own names** (`llm.model`, `tokens_in`). Use the `gen_ai.*` constants.
- ❌ **Capturing prompts by default.** Opt in, and redact.
- ❌ **Using the requested model as the actual model.** Some providers route to a different version. Record `gen_ai.response.model` too when the provider reports it.
- ❌ **Small local models report token counts differently.** A "thinking" model like qwen3 may count its hidden reasoning as output tokens, or not, depending on the server. Compare counts across providers with care.
- ✅ Record failures with `error.type` and an ERROR status, then re-throw.

## Try it yourself

1. Add `gen_ai.response.model` from `r.response.modelId`.
2. Write a `tracedEmbed` function for an `embeddings` span with `gen_ai.usage.input_tokens`.
3. Make content capture redact national ids before storing them (reuse `redactPII` from lesson 06).

## Key takeaways

- The **GenAI semantic conventions** are standard `gen_ai.*` names for model calls; use them so every tool understands your traces.
- A model-call span is named `"{operation} {model}"`, has kind `CLIENT`, and records the request, the response and the token usage.
- **Prompts and answers are opt-in**: they may be PHI.
- Failures get `error.type` and an ERROR status, and are re-thrown.

---

[← Previous: Traces and spans: see where the time goes](../01-traces-and-spans/README.md) · [📚 Series index](../README.md) · [Next: Let the AI SDK write the spans →](../03-ai-sdk-telemetry/README.md)
