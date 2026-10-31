/**
 * Post 00 — The course toolkit   (read the blog post first: 00-course-toolkit/README.md)
 *
 * Shows ONE idea: every example gets its model from `@learn/shared`, which reads .env.
 * This file prints which provider + model .env picked, then makes one tiny call.
 * Full tour of the helpers: ../../shared/README.md
 *
 * Run:  npm run post:00      (or: npx tsx 00-course-toolkit/example.ts)
 */
import { generateText } from 'ai';
// `@learn/shared` is the course's own helper folder (shared/), linked by npm workspaces.
//   chatModel()     → builds the chat model named in .env (AI_PROVIDER + CHAT_MODEL)
//   modelLabel()    → "provider:model" string, for printing
//   section()       → prints a bold header line in the terminal
//   stripThinking() → removes <think>…</think> that reasoning models add before the answer
//   dump()          → prints the FULL value a call returned, labelled and readable
import { chatModel, dump, modelLabel, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// Part A: what did .env pick?  (no model call yet)
// ---------------------------------------------------------------------------
section('[A] Which model is active?');
console.log('Active model:', modelLabel()); // e.g. "ollama:qwen3:8b" — comes only from .env

// ---------------------------------------------------------------------------
// Part B: one call through the toolkit
// ---------------------------------------------------------------------------
section('[B] One call');
const result = await generateText({
  model: chatModel(), // a model OBJECT built from .env; the network call happens inside generateText
  prompt: 'Reply with exactly: toolkit works',
  maxOutputTokens: 300, // room for a reasoning model's <think> block plus the answer
});
const { text } = result; // the field you usually want; the lines below show everything else
console.log('Raw text (first 120 chars):', JSON.stringify(text.slice(0, 120)));
console.log('After stripThinking:       ', JSON.stringify(stripThinking(text)));

// ---------------------------------------------------------------------------
// Part C: everything generateText returned
// ---------------------------------------------------------------------------
// `text` is one field of a much bigger result object. dump() prints all of it.
// Notice: `text` (the answer), `finishReason` ('stop' = finished on its own, 'length' = hit
// maxOutputTokens), `usage` (tokens counted by the provider), `response` (id, model, timestamp)
// and `steps` (one entry per model call — just one here, because no tools were used).
section('[C] The full result object');
dump('generateText() result', result);
