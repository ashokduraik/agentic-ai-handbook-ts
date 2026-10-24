/**
 * Post 01 — Why RAG?   (read the blog post first: 01-why-rag/README.md)
 *
 * One question about OUR hospital's policy, answered three ways:
 *   A. closed book    — the model alone. It has never seen our policy, so it guesses.
 *   B. stuff it all   — paste every document into the prompt. Works for 5 small docs; not for 50,000.
 *   C. retrieve first — find the ONE relevant section, put only that in the prompt. That's RAG.
 * Step C uses a crude word-overlap "retriever" on purpose; posts 02-06 replace it with the real thing.
 *
 * Run: npx tsx 01-why-rag/example.ts            (calls CHAT_MODEL three times)
 *      npx tsx 01-why-rag/example.ts --offline  (prints the three prompts' sizes, no model)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateText } from 'ai';
import { chatModel, modelLabel, section, stripThinking } from '@learn/shared';
import { DOCS_DIR } from '../pipeline/rag.ts';

const question = 'How many no-shows before a deposit is required, and how much is the deposit?';
const offline = process.argv.includes('--offline');

// Our private knowledge: five policy documents the model was never trained on.
const docs = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ source: f, text: readFileSync(join(DOCS_DIR, f), 'utf8') }));

async function ask(label: string, instructions: string, prompt: string) {
  section(label);
  console.log(`prompt size: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`); // ~4 chars per token
  if (offline) return;
  const { text } = await generateText({ model: chatModel(), instructions, prompt, temperature: 0, maxOutputTokens: 600 });
  console.log('answer:', stripThinking(text));
}

console.log(`Question: ${question}   (model: ${modelLabel()})`);

// A. Closed book: the model can only guess from what it learned in training.
await ask('A. Closed book (no documents)', 'You are a hospital assistant. Answer in one sentence.', question);

// B. Stuff everything: correct here, but cost and latency grow with EVERY document you add.
const everything = docs.map((d) => `### ${d.source}\n${d.text}`).join('\n\n');
await ask(
  'B. Stuff every document into the prompt',
  'Answer in one sentence using ONLY the documents.',
  `Documents:\n${everything}\n\nQuestion: ${question}`,
);

// C. Retrieve, then generate: pick the best-matching SECTION and send only that.
const sections = docs.flatMap((d) => d.text.split(/\n(?=## )/).map((s) => ({ source: d.source, text: s.trim() })));
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const overlap = (s: { text: string }) => [...words(question)].filter((w) => words(s.text).has(w)).length;
const best = sections.sort((a, b) => overlap(b) - overlap(a))[0]!; // crude! posts 03-06 do this properly
console.log(`\nretrieved: ${best.source} → "${best.text.split('\n')[0]}"`);
await ask(
  'C. Retrieve the relevant section, then generate',
  'Answer in one sentence using ONLY the source. If it does not contain the answer, say so.',
  `Source (${best.source}):\n${best.text}\n\nQuestion: ${question}`,
);
