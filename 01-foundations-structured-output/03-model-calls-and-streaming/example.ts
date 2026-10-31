/**
 * Post 03 — Calling a model with the AI SDK (and streaming)   (read the blog post first: 03-model-calls-and-streaming/README.md)
 *
 * Shows:
 *   A. generateText — send a request, wait, get the whole answer + why it stopped + token usage.
 *   B. streamText   — get the answer piece by piece while it is being written.
 *   C. fullStream   — the typed events behind a stream (text pieces, start/finish, usage).
 * The model comes from .env (CHAT_MODEL / AI_PROVIDER). This file never names a model or a vendor.
 *
 * Run:  npx tsx 03-model-calls-and-streaming/example.ts
 */
import { generateText, streamText } from 'ai';
// chatModel() reads AI_PROVIDER + CHAT_MODEL from .env and returns an AI SDK model object
// (see shared/src/models.ts). Change .env → same code talks to Ollama, Azure or Bedrock.
import { chatModel, dump, modelLabel, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// Part A: generateText — one request, one complete answer
// ---------------------------------------------------------------------------
section(`[A] generateText (model from .env: ${modelLabel()})`);
const t0 = performance.now();
const result = await generateText({
  model: chatModel(),
  prompt: 'In one sentence: what is an EHR?',
  maxOutputTokens: 300, // always cap the answer length
});
console.log('Answer:      ', stripThinking(result.text)); // stripThinking removes <think>…</think> some models add
console.log('finishReason:', result.finishReason, '  ← "stop" = finished; "length" = cut off by maxOutputTokens');
console.log('usage:       ', { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens });
console.log('time:        ', Math.round(performance.now() - t0), 'ms');

// We do NOT dump the whole generateText() result here: post 00 already showed it in full.
// The lines above picked out the three fields you use most: text, finishReason and usage.
// (Part B below dumps the values of a stream, because those shapes are new.)

// ---------------------------------------------------------------------------
// Part B: streamText — pieces arrive as they are generated
// ---------------------------------------------------------------------------
section('[B] streamText — watch the text arrive');
const s0 = performance.now();
let firstPieceMs: number | undefined;
const stream = streamText({ model: chatModel(), prompt: 'List three causes of high blood pressure, one per line.', maxOutputTokens: 300 });

let pieces = 0;
for await (const piece of stream.textStream) {
  firstPieceMs ??= performance.now() - s0; // time to first token: what a user "feels"
  pieces++;
  process.stdout.write(piece);
}
console.log(`\n→ ${pieces} pieces; first after ${Math.round(firstPieceMs ?? 0)} ms, all done after ${Math.round(performance.now() - s0)} ms`);

// After the stream ends, the same handle gives you the finished values as PROMISES — await them.
// Notice: `text` is all the pieces joined; `finishReason` and `usage` are what generateText
// would have returned; `steps` has the same shape as generateText's steps.
dump('await stream.text', await stream.text);
dump('await stream.finishReason', await stream.finishReason);
dump('await stream.usage', await stream.usage);
dump('await stream.steps', await stream.steps);

// ---------------------------------------------------------------------------
// Part C: fullStream — every event, not just the text
// ---------------------------------------------------------------------------
// textStream only gives you text. fullStream gives typed PARTS: 'start', 'start-step',
// 'text-start', many 'text-delta' (the pieces), 'text-end', 'finish-step', 'finish'.
// Tool calls, reasoning and errors also arrive here as their own part types.
section('[C] fullStream — the typed parts behind a stream');
const parts: unknown[] = [];
for await (const part of streamText({ model: chatModel(), prompt: 'Say: blood pressure is measured in mmHg.', maxOutputTokens: 300 }).fullStream) {
  parts.push(part);
}
// Count each part type, then show the first 5 and the last 3 parts in full.
// Notice the 'finish' part at the end: it carries finishReason and totalUsage.
const counts: Record<string, number> = {};
for (const p of parts as { type: string }[]) counts[p.type] = (counts[p.type] ?? 0) + 1;
dump('part types and how many of each', counts);
dump('first 5 parts', parts.slice(0, 5));
dump('last 3 parts', parts.slice(-3));
