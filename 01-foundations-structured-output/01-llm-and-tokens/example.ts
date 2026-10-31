/**
 * Post 01 — What is an LLM, and what is a token?   (read the blog post first: 01-llm-and-tokens/README.md)
 *
 * This example shows ONE idea: a model does not see letters or words, it sees TOKENS,
 * and the number of tokens (not characters) is what you pay for and wait for.
 *
 * `@learn/shared` = the course's own helper folder (shared/); see ../../shared/README.md
 *
 * Run:  npx tsx 01-llm-and-tokens/example.ts            (parts A + B; part B calls your CHAT_MODEL)
 *       npx tsx 01-llm-and-tokens/example.ts --offline  (part A only, no model needed)
 */
import { generateText } from 'ai';
// js-tiktoken = a pure-JavaScript copy of OpenAI's `tiktoken` tokenizer. It runs offline,
// needs no API key and no native build, and is fast. (Why we chose it: README, "Tokenizers and encodings".)
import { getEncoding } from 'js-tiktoken'; // a TOKENIZER: the program that cuts text into tokens
import { chatModel, dump, section, stripThinking } from '@learn/shared';

// getEncoding(name) loads one ENCODING = a fixed vocabulary of tokens + the rules for cutting text.
// 'o200k_base' is the encoding of OpenAI's newer models (GPT-4o, GPT-4.1, o1/o3/o4-mini): ~200,000 tokens.
// Every model family has its own tokenizer, so for a non-OpenAI model (like Qwen) these numbers
// are an ESTIMATE — see part B.
const tokenizer = getEncoding('o200k_base');

// ---------------------------------------------------------------------------
// Part A: look inside — cut a sentence into its tokens
// ---------------------------------------------------------------------------
section('[A] Text → tokens (what the model actually "reads")');

const samples = [
  'Patient presents with hypertension.', // ordinary English: mostly one token per word
  'Pt c/o HTN.', // shorthand: fewer letters, but NOT fewer tokens
  'المريض يعاني من ارتفاع ضغط الدم', // same sentence in Arabic: different cost
  '{"patient":{"id":"P-001","bp":"150/95"}}', // JSON: every brace and quote is a token too
];

for (const text of samples) {
  const ids = tokenizer.encode(text); // text → list of numbers (token ids)
  // Decode each id back to its piece of text, so you can SEE where the cuts are.
  const pieces = ids.map((id) => tokenizer.decode([id]));
  console.log(`${String(ids.length).padStart(2)} tokens, ${String(text.length).padStart(2)} chars: ${pieces.map((p) => `[${p}]`).join('')}`);
}

// What do encode() and decode() really return? Look at the raw values for the first sample.
// Notice: encode() returns a plain array of integers, nothing else. These ids are what the model
// receives. decode() of the WHOLE array gives the original text back exactly (no information lost).
section('[A2] The raw return values of encode() and decode()');
const firstIds = tokenizer.encode(samples[0]!);
dump(`tokenizer.encode(${JSON.stringify(samples[0])})`, firstIds);
dump('tokenizer.decode(thoseIds)', tokenizer.decode(firstIds));

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part B: the model's own count is the real one
// ---------------------------------------------------------------------------
// Every response reports `usage` — the tokens the provider actually counted. That is your bill
// (cloud) or your waiting time (local). Our local count above is only a budget estimate.
section('[B] Our estimate vs. the provider’s real count');
const prompt = 'Reply with one word: OK';
const result = await generateText({ model: chatModel(), prompt, maxOutputTokens: 200 });
const { usage, text } = result;
console.log('Model replied:', JSON.stringify(stripThinking(text)));
console.log({
  ourEstimateForPrompt: tokenizer.encode(prompt).length,
  providerInputTokens: usage.inputTokens, // larger: the provider adds hidden chat-format tokens
  providerOutputTokens: usage.outputTokens,
});

// We do NOT dump the whole result again: post 00 already showed the full generateText() result.
// Here we only print the fields this post is about. `usage.outputTokens` includes any hidden
// "thinking" tokens, even when `text` is one word, so it can be bigger than you expect.
console.log('finishReason:', result.finishReason);
console.log('usage:', { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens });
