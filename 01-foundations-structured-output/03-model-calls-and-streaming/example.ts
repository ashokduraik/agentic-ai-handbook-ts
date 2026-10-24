/**
 * Post 03 — Calling a model with the AI SDK (and streaming)   (read the blog post first: 03-model-calls-and-streaming/README.md)
 *
 * Shows:
 *   A. generateText — send a request, wait, get the whole answer + why it stopped + token usage.
 *   B. streamText   — get the answer piece by piece while it is being written.
 * The model comes from .env (CHAT_MODEL / AI_PROVIDER). This file never names a model or a vendor.
 *
 * Run:  npx tsx 03-model-calls-and-streaming/example.ts
 */
import { generateText, streamText } from 'ai';
// chatModel() reads AI_PROVIDER + CHAT_MODEL from .env and returns an AI SDK model object
// (see shared/src/models.ts). Change .env → same code talks to Ollama, Azure or Bedrock.
import { chatModel, modelLabel, section, stripThinking } from '@learn/shared';

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
