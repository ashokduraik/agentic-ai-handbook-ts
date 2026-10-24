/**
 * Post 07 — Tracing the agent.
 * Turns on lesson 07's tracing, runs one booking, and prints the trace as a tree:
 * our agent.ask span on top, the AI SDK's model and tool spans underneath.
 *
 *   npm run post:07:offline                       scripted model, spans kept in memory and printed
 *   npm run post:07                               your CHAT_MODEL
 *   TRACE_EXPORTER=otlp npm run post:07           send the spans to Jaeger instead (lesson 07, post 06)
 */
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { setupTracing } from '@learn/07-observability/tracing';
import { scriptedModel } from '@learn/07-observability/mock';
import { modelLabel, optional, section } from '@learn/shared';
import { createAgent } from '../06-the-agent/agent.ts';

const offline = process.argv.includes('--offline');

// 1. The same switch as lesson 07. Default here: keep spans in memory so we can print them.
const exporter = offline ? 'memory' : optional('TRACE_EXPORTER', 'memory')!;
const tracing = setupTracing('capstone', exporter);
registerTelemetry(new OpenTelemetry({ tracer: tracing.tracer })); // the AI SDK now emits GenAI spans

const agent = await createAgent({
  session: { user: 'staff-17', role: 'receptionist', careTeam: ['P-001', 'P-003'] },
  approveWrites: true,
  model: offline
    ? scriptedModel(
        { toolName: 'search_patients', input: { name: 'Fatima Al-Harbi' } },
        { toolName: 'find_slots', input: { specialty: 'cardiology' } },
        { toolName: 'book_appointment', input: { patientId: 'P-001', slotId: 'S-1', reason: 'BP follow-up' } },
        { text: 'Booked S-1 on 25 Oct at 09:00.' },
      )
    : undefined,
});
try {
  section(`One booking · ${offline ? 'scripted model' : modelLabel()} · exporter: ${exporter}`);
  const r = await agent.ask('Book Fatima Al-Harbi the earliest cardiology slot for a blood-pressure follow-up.');
  console.log('answer:', r.answer.replace(/\s+/g, ' ').slice(0, 160));
} finally {
  await agent.close();
}

// 2. Print the trace as a tree, with the attributes that answer "what did it do, and what did it cost?".
if (tracing.memory) {
  section('The trace');
  const spans = tracing.memory.getFinishedSpans();
  type ReadableSpan = (typeof spans)[number];
  const ms = (s: ReadableSpan) => (s.duration[0] * 1e3 + s.duration[1] / 1e6).toFixed(0);
  const pick = (s: ReadableSpan) =>
    Object.entries(s.attributes)
      .filter(([k]) => /^app\.|gen_ai\.usage|gen_ai\.tool\.name/.test(k))
      .map(([k, v]) => `${k.replace(/^(app|gen_ai)\./, '')}=${v}`)
      .join(' ');
  const print = (parent: string | undefined, depth: number) => {
    for (const s of spans.filter((x) => x.parentSpanContext?.spanId === parent)) {
      console.log(`${'  '.repeat(depth)}${s.name}  ${ms(s)} ms  ${pick(s)}`);
      print(s.spanContext().spanId, depth + 1);
    }
  };
  print(undefined, 0);
}
await tracing.shutdown(); // 3. Always flush before exit, or the last spans are lost.
