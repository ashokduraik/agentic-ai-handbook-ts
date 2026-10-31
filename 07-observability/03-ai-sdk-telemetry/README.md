# Post 03 · Let the AI SDK write the spans

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 3 of 6 · about 25 minutes*

> You traced one model call by hand in the last post. The real wait-time bot makes two model calls and a tool call per question, and the discharge-summary agent makes up to ten. Wrapping each by hand would be tedious, and easy to get wrong.
>
> The AI SDK already knows about every call, step and tool. With one line, it writes the spans for you.

---

## The idea, in plain English

The AI SDK can emit OpenTelemetry spans for everything it does. You connect it once at startup with `registerTelemetry(new OpenTelemetry({ tracer }))`, from the `@ai-sdk/otel` package. After that, every `generateText`, `streamText` and `embed` call produces a small tree of spans using the GenAI conventions from [post 02](../02-genai-semantic-conventions/README.md):

```
handle-request                  ← your span: one user request, with business attributes
└─ invoke_agent qwen3:0.6b      ← the whole generateText call: total tokens
   ├─ step 1
   │  ├─ chat qwen3:0.6b        ← model call: asks for the tool (finish_reason: tool-calls)
   │  └─ execute_tool getWaitTime
   └─ step 2
      └─ chat qwen3:0.6b        ← model call: writes the answer
```

Two things are still your job:

1. **The parent span.** The SDK knows about model calls, not about *your* request. Wrap the work in your own span with business attributes (request id, feature, tenant), and the SDK's spans nest under it automatically.
2. **Privacy settings.** By default the AI SDK **records prompts and outputs** on its spans. With real patient data, turn that off per call with `telemetry: { recordInputs: false, recordOutputs: false }`, or filter in your exporter.

`telemetry.functionId` is a free label for the feature (`wait-time-bot`). It lets you filter and group traces by feature in your backend.

---

## Let's see it in code

Open [`example.ts`](./example.ts). With `--offline`, a scripted model asks for the tool and then answers, and the script checks that the span tree really looks as described.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `env` reads the settings from `.env` (provider, model names, Ollama URL); and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — connect the SDK to OpenTelemetry

```ts
// 1. ONE line connects the AI SDK to OpenTelemetry, for every call in this process.
registerTelemetry(new OpenTelemetry({ tracer: tracing.tracer }));
```

Do this once, right after `setupTracing`.

### Step 2 — your request span

```ts
  return tracing.tracer.startActiveSpan('handle-request', async (span) => {
    span.setAttributes({ 'app.request_id': requestId, 'app.feature': 'wait-time-bot' });
```

Everything the SDK does inside this callback becomes a child of `handle-request`.

### Step 3 — a normal call, with telemetry settings

```ts
      const r = await generateText({
        model,
        tools,
        stopWhen: stepCountIs(3),
        maxOutputTokens: 512,
        instructions: 'Answer using the getWaitTime tool. One sentence.',
        prompt: question,
        // 3. Per-call telemetry settings. functionId groups traces by feature in your backend.
        //    With real patient data also pass recordInputs: false, recordOutputs: false.
        telemetry: { functionId: 'wait-time-bot' },
      });
      // The full generateText result is in lesson 01, post 00 (with tools: post 08). Here we log just what
      // maps to spans: each step becomes its own AI SDK span, and `totalUsage` is what the top span records.
      console.log(`steps=${r.steps.length} stepFinishReasons=${r.steps.map((s) => s.finishReason).join(',')} totalUsage in/out=${r.totalUsage.inputTokens}/${r.totalUsage.outputTokens}`);
      span.setAttribute('app.steps', r.steps.length);
```

Nothing else changes in your code. After the call you can add results to your own span, like the number of steps. We log a few result fields first, so you can match them to spans. The full result with all its fields is in [lesson 01, post 00](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned), and a result with tool calls is in [lesson 01, post 08](../../01-foundations-structured-output/08-tool-calling/README.md).

### Step 4 — check the tree (offline)

```ts
  const hasTool = children.some((s) => s.attributes['gen_ai.tool.name'] === 'getWaitTime');
  const hasUsage = children.some((s) => typeof s.attributes['gen_ai.usage.input_tokens'] === 'number');
  if (!children.length || !hasTool || !hasUsage) throw new Error('expected nested AI SDK spans with tool + usage attributes');
```

```ts
  dump('AI SDK span attributes', spans.filter((s) => s !== root).map((s) => ({ name: s.name, attributes: s.attributes })));
```

Offline, the spans are in memory, so the example also dumps (see [`dump`](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) every attribute the AI SDK wrote: much more than the console exporter's one-line summary. Live, use `TRACE_EXPORTER=console-raw` to see the same.

With the `memory` exporter you can **test** your instrumentation like any other code. This check runs in `npm run test:offline`, so a dependency upgrade that breaks tracing fails the build.

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:03:offline   # scripted model + span-tree check
npm run post:03           # your CHAT_MODEL, spans printed to the console
# or: npx tsx 03-ai-sdk-telemetry/example.ts [--offline]
```

### What you should see

- **Live, the result** (box: `qwen3:0.6b`; ids and token counts differ between runs):

```
steps=2 stepFinishReasons=tool-calls,stop totalUsage in/out=364/34
```

  Each part has a span: `steps[0]` is `step 1` with its `chat` span (161 in / 21 out, `finish_reasons=["tool-calls"]`), its tool call is `execute_tool getWaitTime`, `steps[1]` is `step 2`, and `totalUsage` (364 / 34) is on `invoke_agent`.
- **Offline, the span attributes** (scripted model; trimmed):

```
▼ AI SDK span attributes
[
  {
    name: 'chat scripted',
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'mock',
      'gen_ai.request.model': 'scripted',
      'gen_ai.request.max_tokens': 512,
      'gen_ai.system_instructions': '[{"type":"text","content":"Answer using the getWaitTime tool. One sentence."}]',
      'gen_ai.input.messages': '[{"role":"user","parts":[{"type":"text","content":"How long is the wait in the emergency department?"}]}]',
      'gen_ai.tool.definitions': '[{"type":"function","name":"getWaitTime", …}]',
      'gen_ai.client.operation.duration': 0.0005655780000000163,
      'gen_ai.response.finish_reasons': [ 'tool-calls' ],
      …
      'gen_ai.usage.input_tokens': 42,
      'gen_ai.usage.output_tokens': 7,
      'gen_ai.output.messages': '[{"role":"assistant","parts":[{"type":"tool_call","id":"call-0","name":"getWaitTime","arguments":{"department":"emergency"}}],"finish_reason":"tool_call"}]'
    }
  },
  {
    name: 'execute_tool getWaitTime',
    attributes: {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'getWaitTime',
      'gen_ai.tool.call.id': 'call-0',
      'gen_ai.tool.type': 'function',
      'gen_ai.tool.call.arguments': '{"department":"emergency"}',
      'gen_ai.execute_tool.duration': 0.00008855799999997771,
      'gen_ai.tool.call.result': '{"department":"emergency","minutes":45}'
    }
  },
  { name: 'step 1', attributes: { 'gen_ai.operation.name': 'agent_step' } },
  …
  {
    name: 'invoke_agent scripted',
    attributes: {
      'gen_ai.operation.name': 'invoke_agent',
      …
      'gen_ai.agent.name': 'wait-time-bot',
      …
      'gen_ai.usage.input_tokens': 84,
      'gen_ai.usage.output_tokens': 14,
      …
    }
  }
]
```

  Notice `gen_ai.agent.name`: that's the `functionId`. The prompt, instructions, tool definitions, tool arguments and results, and the answer are all recorded by default (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.*`). With patient data, turn that off with `recordInputs: false, recordOutputs: false`. The durations are in seconds.
- **Offline**: the indented tree from the diagram above (`handle-request → invoke_agent → step 1 → chat, execute_tool → step 2 → chat`) and `✅ 6 AI SDK spans nested under handle-request`.
- **Live** (box: `qwen3:0.6b`): seven `[span]` lines, children first. Two `chat qwen3:0.6b` spans (the first with `finish_reasons=["tool-calls"]`), `execute_tool getWaitTime`, two `step` spans, `invoke_agent` with the total tokens (364 in / 34 out on the box), and finally `handle-request … app.steps=2`. The answer: "The wait in the emergency department is 45 minutes."

## Common gotchas

- ❌ **Forgetting `registerTelemetry`.** No error, just no AI SDK spans.
- ❌ **No parent span.** Each `generateText` becomes its own trace, and you can't see one request as a whole.
- ❌ **Leaving prompt and output recording on with patient data.** It's on by default in the SDK; turn it off per call.
- ❌ **Small models and tools:** `qwen3:0.6b` called the tool correctly here, but small models often skip the tool and guess. The trace shows it immediately: no `execute_tool` span.
- ✅ Test your tracing with the `memory` exporter, like any other feature.

## Try it yourself

1. Add `recordInputs: false, recordOutputs: false` and compare the `console-raw` output before and after.
2. Ask a question that doesn't need the tool ("What is triage?"). How does the tree change?
3. Add `app.tenant` (for example the hospital branch) to the request span. Where would that value come from in a real app?

## Key takeaways

- `registerTelemetry(new OpenTelemetry({ tracer }))` makes every AI SDK call emit GenAI spans: call → step → model call / tool.
- Wrap each request in **your own span**; the SDK's spans nest under it automatically.
- Use `telemetry.functionId` to label features, and **turn off input/output recording** for patient data.
- Test your instrumentation with the in-memory exporter.

---

[← Previous: The GenAI semantic conventions](../02-genai-semantic-conventions/README.md) · [📚 Series index](../README.md) · [Next: Tokens, latency and cost per request →](../04-tokens-latency-cost/README.md)
