/**
 * Post 06 — Sending traces somewhere useful: OTLP (Jaeger & co.) and Langfuse
 * (read the blog post first: 06-backends-jaeger-and-langfuse/README.md)
 *
 *   A. OTLP: start a tiny fake "collector" on this machine, point an OTLP exporter at it, and
 *      watch a span arrive as an HTTP request. Jaeger, Tempo, Honeycomb, Grafana and Phoenix all
 *      receive exactly this. (No Docker needed for this part.)
 *   B. Langfuse: the extra span attributes Langfuse understands (trace name, user, session, tags,
 *      prompt name + version). Printed from an in-memory exporter, no account needed.
 *   C. Only if LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set: send a real trace through
 *      the LangfuseSpanProcessor and attach a score to it. (Untested in this course's runs.)
 *
 * Run:  npx tsx 06-backends-jaeger-and-langfuse/example.ts            (A + B, + C with keys)
 *       npx tsx 06-backends-jaeger-and-langfuse/example.ts --offline  (A + B)
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { optional, section } from '@learn/shared';

// The attribute names Langfuse reads from OpenTelemetry spans (from Langfuse's JS SDK, v6).
const LF = {
  TRACE_NAME: 'langfuse.trace.name',
  TRACE_USER_ID: 'user.id',
  TRACE_SESSION_ID: 'session.id',
  TRACE_TAGS: 'langfuse.trace.tags',
  OBSERVATION_PROMPT_NAME: 'langfuse.observation.prompt.name',
  OBSERVATION_PROMPT_VERSION: 'langfuse.observation.prompt.version',
  ENVIRONMENT: 'langfuse.environment',
} as const;

// ---------------------------------------------------------------------------
// Part A: OTLP over HTTP, to a fake collector
// ---------------------------------------------------------------------------
section('[A] OTLP/HTTP → a fake collector on localhost');
const received: { path: string; type: string; bytes: number }[] = [];
const collector = createServer((req, res) => {
  let bytes = 0;
  req.on('data', (chunk: Buffer) => (bytes += chunk.length));
  req.on('end', () => {
    received.push({ path: req.url ?? '', type: req.headers['content-type'] ?? '', bytes });
    res.writeHead(200).end(); // a real collector would decode and store the spans
  });
});
await new Promise<void>((r) => collector.listen(0, r)); // port 0 = any free port
const url = `http://localhost:${(collector.address() as AddressInfo).port}/v1/traces`;

// In your app this is just TRACE_EXPORTER=otlp + OTEL_EXPORTER_OTLP_ENDPOINT (see tracing.ts in post 01).
const otlpProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({ url }))] });
const span = otlpProvider.getTracer('07-post-06').startSpan('chat demo-model', {
  attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.request.model': 'demo-model', 'gen_ai.usage.input_tokens': 31 },
});
span.end();
await otlpProvider.shutdown(); // flushes the span to the collector
collector.close();
console.log('collector received:', received);

// ---------------------------------------------------------------------------
// Part B: Langfuse attributes on a normal OpenTelemetry span
// ---------------------------------------------------------------------------
section('[B] Langfuse attributes (shown from memory)');
const memory = new InMemorySpanExporter();
const memProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memory)] });
// Never send a raw user id to a third party: hash it (and keep the salt secret in real life).
const userHash = createHash('sha256').update('dr-ashok' + 'salt').digest('hex').slice(0, 12);
const lfSpan = memProvider.getTracer('07-post-06').startSpan('discharge-summary', {
  attributes: {
    [LF.TRACE_NAME]: 'discharge-summary', // how the trace is listed in Langfuse
    [LF.TRACE_USER_ID]: userHash, // per-user cost and quality
    [LF.TRACE_SESSION_ID]: 'ward-7-shift-am', // groups the requests of one conversation or shift
    [LF.TRACE_TAGS]: ['cardiology', 'beta'],
    [LF.OBSERVATION_PROMPT_NAME]: 'discharge-summary', // which prompt version produced this answer
    [LF.OBSERVATION_PROMPT_VERSION]: 3,
    [LF.ENVIRONMENT]: 'dev',
  },
});
lfSpan.end();
console.log(memory.getFinishedSpans()[0]!.attributes); // read before shutdown: shutdown clears the memory exporter
await memProvider.shutdown();

// ---------------------------------------------------------------------------
// Part C: a real Langfuse trace + score (only with keys)
// ---------------------------------------------------------------------------
const publicKey = optional('LANGFUSE_PUBLIC_KEY');
const secretKey = optional('LANGFUSE_SECRET_KEY');
if (process.argv.includes('--offline') || !publicKey || !secretKey) {
  console.log('\n[C] skipped: set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL) to send a real trace.');
} else {
  section('[C] Send a trace to Langfuse and score it');
  const baseUrl = optional('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com')!;
  const lfProvider = new NodeTracerProvider({ spanProcessors: [new LangfuseSpanProcessor()] }); // reads LANGFUSE_* env vars
  const traced = lfProvider.getTracer('07-post-06').startSpan('discharge-summary', { attributes: { [LF.TRACE_NAME]: 'discharge-summary', [LF.TRACE_USER_ID]: userHash } });
  const traceId = traced.spanContext().traceId; // Langfuse uses the OpenTelemetry trace id
  traced.end();
  await lfProvider.shutdown();

  // A score is a number (or label) attached to a trace: a user's 👍/👎, an eval result, a reviewer's grade.
  const res = await fetch(`${baseUrl}/api/public/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64') },
    body: JSON.stringify({ traceId, name: 'clinician-thumbs-up', value: 1, dataType: 'NUMERIC' }),
  });
  console.log(`trace ${traceId} sent; score POST → HTTP ${res.status}`);
}
