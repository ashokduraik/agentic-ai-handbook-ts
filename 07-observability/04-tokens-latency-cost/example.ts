/**
 * Post 04 — Tokens, latency and cost per request (and per model)
 * (read the blog post first: 04-tokens-latency-cost/README.md)
 *
 *   We send the same 6 questions to two models, keep the spans in memory, and then do by hand
 *   what a tracing backend's dashboard does for you:
 *     • cost per request   = input tokens × input price + output tokens × output price
 *     • p50 / p95 latency  per model
 *     • a token-usage histogram per model
 *   Prices come from .env (PRICE_PER_MTOK_IN / PRICE_PER_MTOK_OUT, US$ per 1M tokens).
 *
 * Run:  npx tsx 04-tokens-latency-cost/example.ts            (CHAT_MODEL and FALLBACK_MODEL)
 *       npx tsx 04-tokens-latency-cost/example.ts --offline  (two fake models, example prices)
 */
import { generateText, registerTelemetry, type LanguageModel } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { chatModel, dump, env, optional, section } from '@learn/shared';
import { setupTracing } from '../01-traces-and-spans/tracing.ts';
import { fakeModel } from '../support/mock.ts';

const offline = process.argv.includes('--offline');
const tracing = setupTracing('07-post-04', 'memory'); // keep spans in memory: we analyse them below
registerTelemetry(new OpenTelemetry({ tracer: tracing.tracer }));

// 1. Prices are configuration, not code. Self-hosted models cost GPU-hours, not tokens: leave them 0.
const PRICE_IN = Number(optional('PRICE_PER_MTOK_IN', offline ? '0.15' : '0')); // offline: example prices
const PRICE_OUT = Number(optional('PRICE_PER_MTOK_OUT', offline ? '0.60' : '0'));

const questions = [
  'What are the visiting hours on the cardiology ward?',
  'How do I prepare for a fasting blood test?',
  'Can I bring food for a patient in the ICU?',
  'Where do I park for the outpatient clinic?',
  'How long does an MRI scan usually take?',
  'What should I bring to my first appointment?',
];

const models: [string, LanguageModel][] = offline
  ? [['small-fast', fakeModel('small-fast', 300, 60)], ['large-slow', fakeModel('large-slow', 800, 220)]]
  : [env.chatModel, env.fallbackModel].filter((id): id is string => !!id).map((id) => [id, chatModel(id)]);

section(`Sending ${questions.length} questions to ${models.map(([n]) => n).join(' and ')}`);
for (const [name, model] of models)
  for (const q of questions) {
    const r = await generateText({ model, prompt: q, maxOutputTokens: 400, instructions: 'Answer in at most two sentences.' });
    // The usage of the FIRST call per model. Notice `usage` here is the same numbers the span records
    // below; cost is computed from inputTokens and outputTokens only.
    if (q === questions[0]) dump(`generateText() usage — ${name}`, { text: r.text, finishReason: r.finishReason, usage: r.usage, totalUsage: r.totalUsage });
  }

// 2. Read the numbers back from the spans, like a tracing backend would.
//    The AI SDK's top-level span per call carries model, total tokens and duration.
const rows = tracing.memory!.getFinishedSpans()
  .filter((s) => s.attributes['gen_ai.operation.name'] === 'invoke_agent')
  .map((s) => {
    const input = Number(s.attributes['gen_ai.usage.input_tokens'] ?? 0);
    const output = Number(s.attributes['gen_ai.usage.output_tokens'] ?? 0);
    return {
      model: String(s.attributes['gen_ai.request.model']),
      ms: s.duration[0] * 1e3 + s.duration[1] / 1e6,
      input,
      output,
      costUsd: (input * PRICE_IN + output * PRICE_OUT) / 1e6, // 3. cost per request
    };
  });

// One top-level span's attributes, then the row we built from it: everything the cost and latency
// numbers come from. Notice gen_ai.usage.* on the span, and ms / costUsd that we computed ourselves.
const firstSpan = tracing.memory!.getFinishedSpans().find((s) => s.attributes['gen_ai.operation.name'] === 'invoke_agent')!;
dump('first invoke_agent span: attributes', firstSpan.attributes);
dump('cost record (rows[0])', rows[0]);

section('Per request');
for (const r of rows) console.log(`${r.model.padEnd(14)} ${r.ms.toFixed(0).padStart(6)} ms  in=${String(r.input).padStart(4)} out=${String(r.output).padStart(4)}  $${r.costUsd.toFixed(6)}`);

// 4. Percentiles: p50 is the typical request, p95 is what your slowest 1-in-20 users feel.
const percentile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

section('Per model');
for (const [name] of models) {
  const mine = rows.filter((r) => r.model === name);
  const ms = mine.map((r) => r.ms);
  const total = mine.reduce((sum, r) => sum + r.costUsd, 0);
  console.log(`${name.padEnd(14)} requests=${mine.length}  p50=${percentile(ms, 50).toFixed(0)} ms  p95=${percentile(ms, 95).toFixed(0)} ms  cost=$${total.toFixed(6)}  (≈ $${((total / mine.length) * 1000).toFixed(4)} per 1,000 requests)`);

  // 5. A token-usage histogram: how many requests used 0–99, 100–199, ... output tokens.
  const buckets = new Map<number, number>();
  for (const r of mine) {
    const from = Math.floor(r.output / 100) * 100;
    buckets.set(from, (buckets.get(from) ?? 0) + 1);
  }
  for (const [from, n] of [...buckets].sort((a, b) => a[0] - b[0])) console.log(`   output ${String(from).padStart(4)}–${String(from + 99).padEnd(4)} tokens │${'█'.repeat(n)} ${n}`);
}
if (!PRICE_IN && !PRICE_OUT) console.log('\n(cost is $0: set PRICE_PER_MTOK_IN / PRICE_PER_MTOK_OUT in .env to your provider’s prices)');
await tracing.shutdown();
