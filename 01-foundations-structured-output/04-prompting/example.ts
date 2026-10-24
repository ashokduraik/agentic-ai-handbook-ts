/**
 * Post 04 — Prompting: system / user / assistant roles   (read the blog post first: 04-prompting/README.md)
 *
 * Same task, two prompts:
 *   - a VAGUE prompt (one line, no rules, no format), and
 *   - a GOOD prompt built from the parts in the blog post:
 *       system prompt (AI SDK option `instructions`) = role + task + rules + output format,
 *       a few examples (user/assistant pairs = "few-shot"),
 *       then the real input as the last user message.
 * Task: sort patient-portal messages into URGENT / ROUTINE / ADMIN.
 *
 * Run:  npx tsx 04-prompting/example.ts            (prints the good prompt, then runs both on your CHAT_MODEL)
 *       npx tsx 04-prompting/example.ts --offline  (only prints the good prompt's messages)
 */
import { generateText, type ModelMessage } from 'ai';
import { chatModel, section, stripThinking } from '@learn/shared';

// The real inputs we want sorted, with the label a nurse would give them.
const inbox = [
  { text: 'My father has crushing chest pain and is sweating a lot right now', expected: 'URGENT' },
  { text: 'Can I get a copy of my last invoice for insurance?', expected: 'ADMIN' },
  { text: 'My knee still aches a bit after physio, should I book a follow-up?', expected: 'ROUTINE' },
];

// ---------------------------------------------------------------------------
// Prompt 1: vague — the model has to guess what we want and how to answer
// ---------------------------------------------------------------------------
const vague = (text: string) => ({ messages: [{ role: 'user', content: `Is this urgent? ${text}` } as ModelMessage] });

// ---------------------------------------------------------------------------
// Prompt 2: good — clear role, task, rules, exact output format, and examples
// ---------------------------------------------------------------------------
const SYSTEM = [
  'You are a triage assistant for a hospital patient portal.', // ROLE: who the model is
  'Sort each patient message into exactly one category.', // TASK: what to do
  'Categories: URGENT = possible emergency symptoms; ROUTINE = clinical but not an emergency; ADMIN = billing, records, scheduling paperwork.', // DEFINITIONS
  'If unsure between URGENT and ROUTINE, choose URGENT.', // RULE: what to do in the grey zone
  'Reply with the category word only, nothing else.', // OUTPUT FORMAT: easy for code to read
].join('\n');

// FEW-SHOT examples: show, don't just tell. Each pair = an example input and the ideal reply.
const EXAMPLES: ModelMessage[] = [
  { role: 'user', content: 'I fainted twice this morning and feel dizzy' },
  { role: 'assistant', content: 'URGENT' },
  { role: 'user', content: 'Please update my phone number on file' },
  { role: 'assistant', content: 'ADMIN' },
];

// In the AI SDK the system prompt goes in the `instructions` option (not inside `messages`);
// the SDK sends it to the model as the system message.
const good = (text: string) => ({
  instructions: SYSTEM, // standing instructions (same for every message)
  messages: [
    ...EXAMPLES, // examples (same for every message)
    { role: 'user', content: text } as ModelMessage, // the real input (changes every time)
  ],
});

section('[A] The good prompt, as the list of messages the model receives');
const shown = good(inbox[0]!.text);
const asSent: ModelMessage[] = [{ role: 'system', content: shown.instructions }, ...shown.messages]; // what the model receives
for (const m of asSent) console.log(`${m.role.padEnd(9)}| ${String(m.content).replace(/\n/g, '\n         | ')}`);

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Run both prompts on the same inputs and compare
// ---------------------------------------------------------------------------
section('[B] Vague vs. good prompt on the same three messages');
for (const item of inbox) {
  const run = async (p: { instructions?: string; messages: ModelMessage[] }) =>
    stripThinking((await generateText({ model: chatModel(), ...p, temperature: 0, maxOutputTokens: 400 })).text)
      .replace(/\s+/g, ' ')
      .slice(0, 90);
  console.log(`\nMessage:  "${item.text}"   (expected ${item.expected})`);
  console.log(`  vague → ${await run(vague(item.text))}`);
  console.log(`  good  → ${await run(good(item.text))}`);
}
console.log('\nLook for: the good prompt gives ONE word your code can check; the vague one gives free text you would have to interpret.');
