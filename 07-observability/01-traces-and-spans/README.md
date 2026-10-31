# Post 01 · Traces and spans: see where the time goes

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 1 of 6 · about 25 minutes*

> "The assistant was really slow this morning," says the ward manager. You check the logs: one line per request, `200 OK, 4,812 ms`. Was it the database? The model? The retry from lesson 06? The logs can't tell you.
>
> A trace can. It breaks one request into timed steps, so "slow" turns into "the model call took 4.5 s".

---

## The idea, in plain English

### Trace, span, attribute

- A **span** is one timed step: "load the record", "call the model", "save the summary". It has a name, a start time, an end time, and a status (ok or error).
- A **trace** is all the spans for **one request**, arranged as a tree. The outer span ("summarise patient P-001") contains child spans for the steps inside it. Every span in a trace shares the same **trace id**.
- **Attributes** are key/value facts on a span: `app.request_id=req-001`, `gen_ai.request.model=qwen3:0.6b`, `gen_ai.usage.output_tokens=17`. You search and group by them later.

```
summarise-patient   ████████████████████████████████  314 ms   app.request_id=req-001
  load-record       ███                                41 ms
  call-model           ████████████████████████       251 ms   ← here's your slow part
  save-summary                                 ██      20 ms   ❌ disk full
```

If you've used request logging with a correlation id, a trace is that idea done properly: structured, nested and timed.

### OpenTelemetry

**OpenTelemetry** (OTel) is the open standard for traces (and metrics and logs). Your code creates spans with the OTel API. Separately, you configure where finished spans are **exported**: the console, Jaeger, Grafana, Langfuse, a cloud service. Change the exporter and your code stays the same.

In Node, the pieces are:

- a **tracer provider**, created once at startup, which owns the exporter;
- a **tracer**, which you use to start spans;
- a **context manager**, which tracks the "current" span across `await`, so that spans started inside become its children automatically.

### Things that bite people

- **End every span.** A span without `end()` is never exported.
- **Flush before exit.** Exporters buffer spans. A CLI or serverless function that exits without `shutdown()` loses the last ones.
- **Attributes are not a log of everything.** Put ids and numbers there, not names, national ids or full prompts. Traces are often kept longer and seen by more people than your database.

---

## Let's see it in code

Open [`example.ts`](./example.ts), and [`tracing.ts`](./tracing.ts) beside it. `tracing.ts` is the shared setup that every later post (and the lesson 10 capstone) imports.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output and `optional(name, default)` reads an optional setting from the environment. [More about these helpers](../../shared/README.md).

### Step 1 — one place decides where spans go

```ts
export function setupTracing(serviceName: string, exporter = optional('TRACE_EXPORTER', 'console')!): Tracing {
```

```ts
    case 'console':
      processor = new SimpleSpanProcessor(new CompactConsoleExporter());
      break;
```

```ts
    case 'otlp':
      // Batch in production: spans are buffered and sent in the background.
      processor = new BatchSpanProcessor(new OTLPTraceExporter()); // reads OTEL_EXPORTER_OTLP_* env vars
      break;
```

`TRACE_EXPORTER` from `.env` picks the exporter. `console` uses a small exporter in the same file that prints one line per span. `otlp` and `langfuse` send spans to a backend ([post 06](../06-backends-jaeger-and-langfuse/README.md)). `memory` keeps them in an array for tests.

```ts
  // register() installs the global provider AND an AsyncLocalStorage context manager,
  // which is what makes spans created inside `await`ed code nest under their parent.
  provider.register();
```

This is what makes nesting automatic.

### Step 2 — set up once, at startup

```ts
// 1. Set up tracing ONCE, at startup, before anything else runs.
const { tracer, shutdown } = setupTracing('07-post-01');
```

The service name appears in every backend, so you can tell your services apart.

### Step 3 — the request span

```ts
await tracer.startActiveSpan('summarise-patient', async (request) => {
  request.setAttribute('app.request_id', 'req-001'); // attributes: searchable key/value facts
  request.setAttribute('app.patient_ref', 'P-001'); // an internal id, never a name or national id
```

`startActiveSpan` starts a span **and makes it current** while the callback runs. Our own attributes use an `app.` prefix so they never clash with standard names.

### Step 4 — child spans

```ts
  await tracer.startActiveSpan('load-record', async (span) => {
    await sleep(40); // pretend: database query
    span.end();
  });
```

Because the request span is current, this one becomes its child. No ids passed around by hand.

```ts
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'disk full' }); // 4. failures are recorded too
```

A span can be marked as failed. Backends count and highlight these.

### Step 4b — print the whole span

```ts
    dump('the finished call-model span', span);
```

```ts
    // Same shape as call-model above; notice `status`: code 2 is ERROR (0 = unset, 1 = OK), with our message.
    const finished = span as unknown as ReadableSpan;
    console.log('save-summary:', finished.name, finished.status);
```

```ts
  dump('request.spanContext()', request.spanContext());
```

[`dump(label, value)`](../../shared/README.md#dumplabel-value--print-the-full-returned-value) prints the full value. After `span.end()`, the span object is exactly what an exporter receives, so you see every field a backend stores. The `save-summary` span has the same shape, so the example logs only its `name` and ERROR `status`.

### Step 5 — end and flush

```ts
  request.end(); // a span's duration = end time − start time. Always end your spans.
```

```ts
// 5. Flush before exit, or the last spans may never be exported.
await shutdown();
```

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:01           # no model needed
TRACE_EXPORTER=console-raw npm run post:01   # the full span objects, ids and all
# or: npx tsx 01-traces-and-spans/example.ts
```

### What you should see

Ids, times and durations differ on every run. Trimmed with "…":

```
[span]   └─ load-record (40 ms) 
[span]   └─ call-model (250 ms) app.note="this is where an LLM call will go in post 02"
▼ the finished call-model span
SpanImpl {
  duration: [ 0, 249746409 ],
  ended: true,
  …
  kind: 0,
  parentSpanContext: {
    traceId: 'e3e1d5c0c49f43410765b84063875f40',
    spanId: '8459a65987999424',
    traceFlags: 1
  },
  attributes: { 'app.note': 'this is where an LLM call will go in post 02' },
  links: [],
  events: [],
  startTime: [ 1792857230, 236000000 ],
  resource: ResourceImpl {
    asyncAttributesPending: false,
    attributes: { 'service.name': '07-post-01', 'service.version': '1.0.0' }
  },
  instrumentationScope: { name: '07-post-01' },
  name: 'call-model',
  status: { code: 0 },
  endTime: [ 1792857230, 485746409 ]
}
…
save-summary: save-summary { code: 2, message: 'disk full' }
[span]   └─ save-summary (21 ms) ❌ 
trace id: e3e1d5c0c49f43410765b84063875f40
▼ request.spanContext()
{ traceId: 'e3e1d5c0c49f43410765b84063875f40', spanId: '8459a65987999424', traceFlags: 1 }
[span] summarise-patient (316 ms) app.request_id="req-001" app.patient_ref="P-001"
```

| Field | What it means |
| --- | --- |
| `startTime`, `endTime` | `[seconds, nanoseconds]` since 1970. |
| `duration` | `endTime − startTime`, in the same `[seconds, nanoseconds]` form: `[0, 249746409]` is 0.25 s. |
| `kind` | 0 = INTERNAL (work inside this process). Post 02 uses 2 = CLIENT for a call to a model server. |
| `parentSpanContext` | The parent's ids. Its `spanId` is the request span's `spanId` from `request.spanContext()`, and its `traceId` is the shared trace id. The root span has no `parentSpanContext`. |
| `attributes` | The key/value facts set with `setAttribute`. |
| `events` | Timestamped notes inside a span. Post 02 shows the `exception` event a failure adds. |
| `resource` | Who produced the span: `service.name` comes from `setupTracing('07-post-01')`. |
| `status` | `code` 0 = unset, 1 = OK, 2 = ERROR, plus an optional message. |
| `traceFlags` | 1 = sampled: this span will be exported. |

Children print **before** their parent, because a span is exported when it **ends**, and the parent ends last. With `console-raw`, check that every span has the same `traceId` and that each child's `parentSpanContext.spanId` is the parent's id.

## Common gotchas

- ❌ **Forgetting `span.end()`.** The span never appears. `startActiveSpan` doesn't end it for you.
- ❌ **Exiting without `shutdown()`.** The last spans are lost, especially with the batching `otlp` exporter.
- ❌ **Setting up tracing after other imports run.** Set it up first, at startup.
- ❌ **Putting PHI in attributes.** Patient names, national ids and full notes don't belong in traces.
- ✅ Use your own prefix (`app.`) for business attributes, and the standard names for everything else (next post).

## Try it yourself

1. Add a span `check-allergies` inside `load-record`. Does it print with the right nesting in `console-raw`?
2. Remove `span.end()` from `call-model`. What happens to the output?
3. Change `save-summary` to throw an error, and record it with `span.recordException(e)` before ending the span.

## Key takeaways

- A **trace** is one request; **spans** are its timed steps, in a tree; **attributes** are searchable facts.
- OpenTelemetry separates **creating** spans (your code) from **exporting** them (configuration).
- `startActiveSpan` nests children automatically, even across `await`.
- Always **end** spans and **flush** before exit.

---

[← Previous: Lesson 06 — Guardrails & fallbacks](../../06-guardrails/README.md) · [📚 Series index](../README.md) · [Next: The GenAI semantic conventions →](../02-genai-semantic-conventions/README.md)
