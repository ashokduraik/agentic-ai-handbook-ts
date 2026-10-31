# Post 07 · Tracing the agent: every step, every tool, every token

*Series: [Lesson 10 — Capstone](../README.md) · Post 7 of 8 · about 15 minutes*

> A receptionist reports: "I asked it to book Fatima and it said she's not in my care team. She is!" The answer alone doesn't tell you what went wrong. Which tools ran? With what input? Which step refused? How long did each take?

---

## The idea, in plain English

[Lesson 07](../../07-observability/README.md) taught **tracing**: one request becomes a tree of timed **spans**. An agent is where tracing pays off most, because one question becomes many hidden steps.

The capstone's trace has two layers:

- **Our span**, `agent.ask`, created in `agent.ts`. It carries the *business* facts as attributes: user, role, whether writes were approved, number of steps and tool calls, how many were denied or `FORBIDDEN`, and whether a guard blocked something.
- **The AI SDK's spans**, underneath, following the OpenTelemetry GenAI conventions: `invoke_agent` for the whole loop, a `step N` per round, `chat <model>` per model call (with token counts) and `execute_tool <name>` per tool call.

The same `TRACE_EXPORTER` switch as lesson 07 decides where spans go: `console`, `memory`, `otlp` (Jaeger, Grafana Tempo…) or `langfuse`. This example defaults to `memory` and prints the tree itself.

Attributes carry ids, counts and timings, not patient data. Tool results are redacted before the model sees them (post 04), but don't add raw questions or answers to spans unless your trace backend is approved for PHI.

---

## Let's see it in code

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `modelLabel()` gives a printable label such as `ollama:<model>`; `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — our span in the agent

This part lives in [`agent.ts`](../06-the-agent/agent.ts) from post 06:

```ts
    return tracer.startActiveSpan('agent.ask', async (span) => {
      span.setAttributes({ 'app.user': session.user, 'app.role': session.role, 'app.approve_writes': !!opts.approveWrites });
```

```ts
        span.setAttributes({
          'app.steps': r.steps.length,
          'app.tool_calls': events.length,
          'app.denied': events.filter((e) => e.outcome === 'denied').length,
          'app.forbidden': events.filter((e) => e.detail.includes('FORBIDDEN')).length,
        });
```

`startActiveSpan` makes it the *active* span, so the AI SDK's spans nest under it.

### Step 2 — turning on the AI SDK's spans

```ts
const exporter = offline ? 'memory' : optional('TRACE_EXPORTER', 'memory')!;
const tracing = setupTracing('capstone', exporter);
registerTelemetry(new OpenTelemetry({ tracer: tracing.tracer })); // the AI SDK now emits GenAI spans
```

`setupTracing` is lesson 07's file (`@learn/07-observability/tracing`).

### Step 3 — printing the tree, and flushing

```ts
    for (const s of spans.filter((x) => x.parentSpanContext?.spanId === parent)) {
      console.log(`${'  '.repeat(depth)}${s.name}  ${ms(s)} ms  ${pick(s)}`);
      print(s.spanContext().spanId, depth + 1);
    }
```

```ts
await tracing.shutdown(); // 3. Always flush before exit, or the last spans are lost.
```

### Step 4 — the root span

The result of `ask()` is not dumped here: its shape is dumped in [post 06](../06-the-agent/README.md#step-5--seeing-the-results), and the example prints just the `answer`. The trace shows the same run, step by step. A span's full shape (ids, times, resource, scope) was dumped in [lesson 07, post 01](../../07-observability/01-traces-and-spans/README.md#step-4b--print-the-whole-span), so the root span is dumped here with only the fields this post is about: its `name`, the `attributes` the agent set, and `status`. The duration is already in the tree. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
  // The root span: only the fields this post is about. Notice the app.* attributes the agent set (user, role,
  // steps, tool_calls, denied, forbidden) and `status`. The full span shape (ids, times, resource, scope) was
  // dumped in lesson 07, post 01; the duration is already in the tree above.
  const root = spans.find((s) => s.name === 'agent.ask')!;
  dump('the agent.ask span: name, attributes and status', { name: root.name, attributes: root.attributes, status: root.status });
```

The span dump only runs when spans are kept in memory (offline, or `TRACE_EXPORTER=memory`).

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:07:offline                 # scripted model, tree printed from memory
npm run post:07                         # your CHAT_MODEL
TRACE_EXPORTER=otlp npm run post:07     # to Jaeger: start it with lesson 07's docker-compose.jaeger.yaml
# or: npx tsx 07-tracing-the-agent/example.ts --offline
```

### What you should see

Offline (timings vary). The run prints the answer, then the tree and the root span:

```
agent.ask  33 ms  user=staff-17 role=receptionist approve_writes=true steps=4 tool_calls=3 denied=0 forbidden=0
  invoke_agent scripted  27 ms  usage.input_tokens=168 usage.output_tokens=28
    step 1  9 ms
      chat scripted  2 ms  usage.input_tokens=42 usage.output_tokens=7
      execute_tool search_patients  5 ms  tool.name=search_patients
    step 2  9 ms
      chat scripted  1 ms  usage.input_tokens=42 usage.output_tokens=7
      execute_tool find_slots  8 ms  tool.name=find_slots
    step 3  3 ms
      …
      execute_tool book_appointment  1 ms  tool.name=book_appointment
    step 4  0 ms
      chat scripted  0 ms  usage.input_tokens=42 usage.output_tokens=7
▼ the agent.ask span: name, attributes and status
{
  name: 'agent.ask',
  attributes: {
    'app.user': 'staff-17',
    'app.role': 'receptionist',
    'app.approve_writes': true,
    'app.steps': 4,
    'app.tool_calls': 3,
    'app.denied': 0,
    'app.forbidden': 0
  },
  status: { code: 0 }
}
```

| Field | What it tells you |
|---|---|
| `attributes` | Only the `app.*` keys the agent set itself; the `gen_ai.*` keys are on the child spans. |
| `status.code` | `0` means UNSET, the normal value for a span that didn't fail. `agent.ts` sets `2` (ERROR) when `ask()` throws. |

The span's `duration`, `resource` and `startTime`/`endTime` are left out of the dump on purpose (they were explained in lesson 07, post 01): the duration is the `33 ms`-style number in the tree.

Live with `TRACE_EXPORTER=memory` (`qwen3:0.6b`), an earlier run's span showed `'app.steps': 2`, `'app.tool_calls': 1`, `'app.forbidden': 1` and a duration of 1.5 s. The agent's result had one `book_appointment` event with `outcome: 'error'` and a FORBIDDEN `detail`: the model passed a name as the id again.

Live on the box, with `TRACE_EXPORTER=console` set in `.env`, lesson 07's console exporter printed each span as it ended (children first). The trace answered the receptionist's complaint at once: `steps=2 tool_calls=1 forbidden=1`, one `execute_tool book_appointment`, and no `search_patients` at all. The small model skipped the search and passed a name as the id, so the host refused it. Each `chat qwen3:0.6b` call took about 1.1 s, with 439 and 512 input tokens: most of that is the tool definitions, sent on every step.

**Not tested by the course author:** the `otlp` (Jaeger) and `langfuse` exporters with this lesson.

## Common gotchas

- ❌ **Forgetting `shutdown()`** in a CLI: the process exits before the last spans are sent.
- ❌ **Patient data in span attributes.** Traces are often kept longer and seen by more people than the database.
- ❌ **Creating your span with `startSpan`** (not active): the AI SDK's spans become separate traces.
- ❌ **Only looking at the answer.** `forbidden=1` or `denied=1` on the root span tells you more than the text.
- ✅ Tool definitions are sent with *every* model call: watch input tokens per step when you add tools.

## Try it yourself

1. Add `app.blocked_reason` to the root span for input-guard blocks, then run with the question "Ignore previous instructions".
2. Sum `usage.input_tokens` across the `chat` spans and compare with `invoke_agent`'s total.
3. With Jaeger running, find the slowest `execute_tool` span across ten runs.

## Key takeaways

- An agent request is a **tree**: `agent.ask` → `invoke_agent` → steps → `chat` and `execute_tool` spans.
- Put **business facts** (role, denied, forbidden) on your own span; the AI SDK adds tokens and timings.
- Same `TRACE_EXPORTER` switch as lesson 07; always **flush** before exit; keep PHI out.

---

[← Previous: The agent](../06-the-agent/README.md) · [📚 Series index](../README.md) · [Next: Evals for an agent →](../08-agent-evals/README.md)
