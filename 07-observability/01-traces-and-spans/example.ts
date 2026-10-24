/**
 * Post 01 — Traces and spans: see where the time goes in one request
 * (read the blog post first: 01-traces-and-spans/README.md)
 *
 *   One pretend request ("summarise patient P-001") with three steps inside it. Each step is a
 *   SPAN; together they form one TRACE. No model needed: the steps just wait.
 *   tracing.ts (next to this file) decides where finished spans go (TRACE_EXPORTER).
 *
 * Run:  npx tsx 01-traces-and-spans/example.ts
 *       TRACE_EXPORTER=console-raw npx tsx 01-traces-and-spans/example.ts   (full span objects)
 */
import { SpanStatusCode } from '@opentelemetry/api';
import { section } from '@learn/shared';
import { setupTracing } from './tracing.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. Set up tracing ONCE, at startup, before anything else runs.
const { tracer, shutdown } = setupTracing('07-post-01');

section('One request = one trace with nested spans');

// 2. The outer span: one user request. startActiveSpan makes it the "current" span, so spans
//    started inside the callback (even after `await`) become its children automatically.
await tracer.startActiveSpan('summarise-patient', async (request) => {
  request.setAttribute('app.request_id', 'req-001'); // attributes: searchable key/value facts
  request.setAttribute('app.patient_ref', 'P-001'); // an internal id, never a name or national id

  // 3. Child spans: the steps inside the request.
  await tracer.startActiveSpan('load-record', async (span) => {
    await sleep(40); // pretend: database query
    span.end();
  });
  await tracer.startActiveSpan('call-model', async (span) => {
    await sleep(250); // pretend: the slow part
    span.setAttribute('app.note', 'this is where an LLM call will go in post 02');
    span.end();
  });
  await tracer.startActiveSpan('save-summary', async (span) => {
    await sleep(20);
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'disk full' }); // 4. failures are recorded too
    span.end();
  });

  // Every span in this trace shares ONE trace id; each has its own span id.
  console.log('trace id:', request.spanContext().traceId);
  request.end(); // a span's duration = end time − start time. Always end your spans.
});

// 5. Flush before exit, or the last spans may never be exported.
await shutdown();
