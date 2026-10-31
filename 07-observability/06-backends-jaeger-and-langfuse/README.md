# Post 06 · Sending traces somewhere useful: Jaeger and Langfuse

*Series: [Lesson 07 — Observability & cost](../README.md) · Post 6 of 6 · about 35 minutes*

> Console output was fine on your laptop. In production you have three server instances, 40,000 requests a day, and a question from yesterday at 09:14. You need the traces stored, searchable and drawn as timelines. And the clinical lead wants to know whether version 3 of the discharge-summary prompt is better than version 2.
>
> This post sends the same spans to real backends: any OpenTelemetry backend over OTLP, and Langfuse, which adds LLM-specific views.

---

## The idea, in plain English

### OTLP: one protocol, many backends

**OTLP** (the OpenTelemetry Protocol) is how spans travel from your app to a backend: an HTTP POST to `/v1/traces` with the spans encoded as protobuf. Jaeger, Grafana Tempo, Honeycomb, Datadog, Arize Phoenix, Azure Monitor and AWS X-Ray all accept it, directly or through the **OpenTelemetry Collector** (a small service that receives, filters and forwards spans).

So switching backends is configuration, not code:

```bash
TRACE_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # where to send
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=...            # if the backend needs a key
```

**Jaeger** is a free, open-source trace viewer you can run locally with Docker. It's a good first backend: search traces, see timelines, compare slow and fast requests.

### Langfuse: an LLM-focused backend

**Langfuse** (open source, self-hosted or cloud) receives the same OpenTelemetry spans through its `LangfuseSpanProcessor`, and adds views made for LLM apps:

- **Users and sessions**: cost and quality per user, and all requests of one conversation together. Set with `user.id` and `session.id` attributes.
- **Prompt versions**: link each answer to the prompt name and version that produced it, so you can compare version 2 and version 3. Langfuse can also *store* your prompts and serve them to your app.
- **Scores**: numbers attached to a trace: a clinician's 👍/👎, an LLM-judge grade, an eval result. Send them with the API after the fact.
- **Tags and environment**: filter dev from production, or a beta feature from the rest.

Same rule as always: hash user ids and keep PHI out. Langfuse is another place your data lives.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** proves the OTLP path with a fake collector (no Docker). Part **B** shows the Langfuse attributes. Part **C** sends to a real Langfuse, only if you've set keys.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `optional(name, default)` reads an optional setting from the environment and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — a fake collector

```ts
const collector = createServer((req, res) => {
  let bytes = 0;
  req.on('data', (chunk: Buffer) => (bytes += chunk.length));
  req.on('end', () => {
    received.push({ path: req.url ?? '', type: req.headers['content-type'] ?? '', bytes });
    res.writeHead(200).end(); // a real collector would decode and store the spans
  });
});
```

A plain Node HTTP server that records what arrives. It shows there's no magic: OTLP is just a POST.

### Step 2 — an OTLP exporter pointed at it

```ts
// In your app this is just TRACE_EXPORTER=otlp + OTEL_EXPORTER_OTLP_ENDPOINT (see tracing.ts in post 01).
const otlpProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({ url }))] });
```

```ts
await otlpProvider.shutdown(); // flushes the span to the collector
```

The `received` list then shows one POST to `/v1/traces`, type `application/x-protobuf`.

### Step 3 — Langfuse attributes

```ts
const userHash = createHash('sha256').update('dr-ashok' + 'salt').digest('hex').slice(0, 12);
```

```ts
    [LF.TRACE_NAME]: 'discharge-summary', // how the trace is listed in Langfuse
    [LF.TRACE_USER_ID]: userHash, // per-user cost and quality
    [LF.TRACE_SESSION_ID]: 'ward-7-shift-am', // groups the requests of one conversation or shift
    [LF.TRACE_TAGS]: ['cardiology', 'beta'],
    [LF.OBSERVATION_PROMPT_NAME]: 'discharge-summary', // which prompt version produced this answer
    [LF.OBSERVATION_PROMPT_VERSION]: 3,
```

These are ordinary span attributes. Langfuse reads them; other backends just store them.

```ts
console.log(memory.getFinishedSpans()[0]!.attributes); // read before shutdown: shutdown clears the memory exporter
// Full finished-span shape: lesson 07, post 01.
```

The attributes are what matter for Langfuse; the full finished-span shape is in [post 01](../01-traces-and-spans/README.md).

### Step 4 — a score (with keys)

```ts
  const res = await fetch(`${baseUrl}/api/public/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64') },
    body: JSON.stringify({ traceId, name: 'clinician-thumbs-up', value: 1, dataType: 'NUMERIC' }),
  });
```

```ts
  dump('score POST response', { status: res.status, statusText: res.statusText, json: await res.json().catch(() => null) });
```

The HTTP status and Langfuse's JSON reply. If the reply isn't JSON, `json` is `null`.

A score is linked to a trace by the OpenTelemetry trace id. In a real app you'd send it when the clinician clicks 👍, minutes after the request.

---

## Run it

From the lesson folder (`07-observability/`):

```bash
npm run post:06:offline   # parts A + B
npm run post:06           # A + B, and C if LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are set

# A real Jaeger (needs Docker):
npm run jaeger                                   # starts docker-compose.jaeger.yaml
TRACE_EXPORTER=otlp npm run post:03              # then open http://localhost:16686

# Langfuse (needs an account or a self-hosted instance):
TRACE_EXPORTER=langfuse npm run post:03
```

### What you should see

- **A**: `collector received: [ { path: '/v1/traces', type: 'application/x-protobuf', bytes: 408 } ]`.
- **B**: the span's attributes: `langfuse.trace.name`, `user.id` (a hash), `session.id`, tags, prompt name and version, environment (real output; the hash differs when the salt changes):

```
{
  'langfuse.trace.name': 'discharge-summary',
  'user.id': 'c64ad5138a30',
  'session.id': 'ward-7-shift-am',
  'langfuse.trace.tags': [ 'cardiology', 'beta' ],
  'langfuse.observation.prompt.name': 'discharge-summary',
  'langfuse.observation.prompt.version': 3,
  'langfuse.environment': 'dev'
}
```

  The full finished-span shape (including `resource` / `service.name`) is in [post 01](../01-traces-and-spans/README.md). This provider was created without a resource, so OpenTelemetry would make one up from the Node path; `setupTracing` in post 01 sets a real name — always do that, or every service looks the same in your backend.
- **C**: `trace … sent; score POST → HTTP 200` (or `[C] skipped` without keys), then the response. *Illustrative only: part C was not run for this course (no Langfuse keys). The JSON reply's exact shape comes from Langfuse's API; for a successful score it should include the new score's id.* For example:

```
▼ score POST response
{ status: 200, statusText: 'OK', json: { id: '…' } }
```

**What was tested:** parts A and B, and `TRACE_EXPORTER=otlp` sending post 03's spans to a local test receiver on port 4318. **Not tested:** the Docker Jaeger UI, a real Langfuse account (part C and `TRACE_EXPORTER=langfuse`), and cloud backends. Check Langfuse's current docs if the score API has changed.

## Common gotchas

- ❌ **Using `SimpleSpanProcessor` in production.** It sends each span as it ends, blocking. Use the batch processor (`tracing.ts` does for `otlp`).
- ❌ **Forgetting to flush** on shutdown, so the last batch is lost.
- ❌ **Raw user ids and PHI** in a third-party backend. Hash ids; keep content capture off.
- ❌ **Port confusion.** OTLP/HTTP is 4318, OTLP/gRPC is 4317, Jaeger's UI is 16686.
- ❌ **No sampling at scale.** Tracing every request of a busy service costs money too. Sample (for example 10%, plus every error).
- ✅ Keep instrumentation vendor-neutral (OTel + `gen_ai.*`), and choose the backend with configuration.

## Try it yourself

1. Start Jaeger, run posts 03 and 05 with `TRACE_EXPORTER=otlp`, and find the slowest span in each trace.
2. Add the Langfuse prompt name and version to post 03's `handle-request` span, then change the instructions and bump the version.
3. (With Langfuse) Send a second score, `citations-valid`, from post 05's check. Then filter traces by it in the Langfuse UI.
4. Build the map's exercise: a token-usage histogram and p95 latency per model in your backend (post 04 showed the maths), plus one Langfuse run.

## Key takeaways

- **OTLP** is the standard way to ship spans; Jaeger, Tempo, cloud services and Langfuse all accept it.
- Changing backends is **configuration** (`TRACE_EXPORTER`, `OTEL_EXPORTER_OTLP_*`), not code.
- **Langfuse** adds LLM views: users, sessions, **prompt versions** and **scores**, all from span attributes plus a score API.
- Batch, flush, sample, and keep PHI out.

---

[← Previous: Tracing a RAG pipeline](../05-tracing-a-rag-pipeline/README.md) · [📚 Series index](../README.md) · [Next: Lesson 08 — Cloud providers & the gateway →](../../08-cloud/README.md)
