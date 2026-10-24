/**
 * Post 03 — Let the AI SDK write the spans, and nest them under YOUR request span
 * (read the blog post first: 03-ai-sdk-telemetry/README.md)
 *
 *   registerTelemetry(new OpenTelemetry({ tracer })) once at startup; every generateText /
 *   streamText / embed then produces GenAI spans (the call → each step → model call → tool).
 *   You add business context (request id, feature) on your own parent span.
 *
 * Run:  npx tsx 03-ai-sdk-telemetry/example.ts            (your CHAT_MODEL)
 *       npx tsx 03-ai-sdk-telemetry/example.ts --offline  (a scripted model + a self-check of the span tree)
 */
import { SpanStatusCode } from '@opentelemetry/api';
import { generateText, registerTelemetry, stepCountIs, tool, type LanguageModel } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { z } from 'zod';
import { chatModel, env, section } from '@learn/shared';
import { setupTracing } from '../01-traces-and-spans/tracing.ts';
import { scriptedModel } from '../support/mock.ts';

const offline = process.argv.includes('--offline');
// Offline we keep spans in memory so we can check the tree; live we print them (TRACE_EXPORTER).
const tracing = setupTracing('07-post-03', offline ? 'memory' : undefined);

// 1. ONE line connects the AI SDK to OpenTelemetry, for every call in this process.
registerTelemetry(new OpenTelemetry({ tracer: tracing.tracer }));

const tools = {
  getWaitTime: tool({
    description: 'Current waiting time in minutes for a hospital department',
    inputSchema: z.object({ department: z.string() }),
    execute: async ({ department }) => ({ department, minutes: department.toLowerCase().includes('emerg') ? 45 : 15 }),
  }),
};

async function handleRequest(requestId: string, question: string, model: LanguageModel) {
  // 2. Our own parent span: "one user request". AI SDK spans become its children automatically.
  return tracing.tracer.startActiveSpan('handle-request', async (span) => {
    span.setAttributes({ 'app.request_id': requestId, 'app.feature': 'wait-time-bot' });
    try {
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
      span.setAttribute('app.steps', r.steps.length);
      return r.text;
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally {
      span.end();
    }
  });
}

section(`One request with a tool call (${offline ? 'scripted model' : env.chatModel})`);
const model = offline
  ? scriptedModel({ toolName: 'getWaitTime', input: { department: 'emergency' } }, { text: 'About 45 minutes in emergency.' })
  : chatModel();
console.log('answer:', await handleRequest('req-001', 'How long is the wait in the emergency department?', model));

if (tracing.memory) {
  // 4. Offline self-check: print the tree, and fail if the expected spans are missing.
  const spans = tracing.memory.getFinishedSpans();
  const root = spans.find((s) => s.name === 'handle-request')!;
  const byId = new Map(spans.map((s) => [s.spanContext().spanId, s]));
  const depth = (s: (typeof spans)[number]): number => (s.parentSpanContext ? 1 + depth(byId.get(s.parentSpanContext.spanId)!) : 0);
  const startNs = (s: (typeof spans)[number]) => s.startTime[0] * 1e9 + s.startTime[1];
  for (const s of [...spans].sort((a, b) => startNs(a) - startNs(b) || depth(a) - depth(b))) {
    const usage = s.attributes['gen_ai.usage.input_tokens'] !== undefined ? ` tokens in/out=${s.attributes['gen_ai.usage.input_tokens']}/${s.attributes['gen_ai.usage.output_tokens']}` : '';
    const toolName = s.attributes['gen_ai.tool.name'] ? ` tool=${s.attributes['gen_ai.tool.name']}` : '';
    console.log(`${'   '.repeat(depth(s))}${s.name}${toolName}${usage}`);
  }
  const children = spans.filter((s) => s.spanContext().traceId === root.spanContext().traceId && s !== root);
  const hasTool = children.some((s) => s.attributes['gen_ai.tool.name'] === 'getWaitTime');
  const hasUsage = children.some((s) => typeof s.attributes['gen_ai.usage.input_tokens'] === 'number');
  if (!children.length || !hasTool || !hasUsage) throw new Error('expected nested AI SDK spans with tool + usage attributes');
  console.log(`✅ ${children.length} AI SDK spans nested under handle-request (tool + token usage recorded)`);
}
await tracing.shutdown();
