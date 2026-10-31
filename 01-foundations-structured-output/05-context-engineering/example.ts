/**
 * Post 05 — Context engineering   (read the blog post first: 05-context-engineering/README.md)
 *
 * Context engineering = choosing WHAT goes into the context window for this one call.
 * Here we answer a nurse's question. We have lots of material available (policies, patient record,
 * chat history), but we put in only what is relevant, within a token budget, in a clear layout.
 *
 * Run:  npx tsx 05-context-engineering/example.ts            (builds the context, then asks your CHAT_MODEL)
 *       npx tsx 05-context-engineering/example.ts --offline  (only builds and prints the context)
 */
import { generateText } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { chatModel, dump, section, stripThinking } from '@learn/shared';

const tokenizer = getEncoding('o200k_base');
const tokens = (s: string) => tokenizer.encode(s).length;

const question = 'Can Fatima in bed 12 have ibuprofen for her knee pain?';

// ---------------------------------------------------------------------------
// Everything we COULD send (in real life: databases, documents, previous messages)
// ---------------------------------------------------------------------------
const policies = [
  { title: 'Visiting hours', text: 'ICU visiting is 4pm–8pm, two visitors at a time. Children under 12 need approval.' },
  { title: 'Parking', text: 'Visitor parking is in building C. The first 30 minutes are free.' },
  { title: 'NSAIDs and anticoagulants', text: 'Do not give NSAIDs such as ibuprofen to patients on warfarin without a doctor’s order: bleeding risk. Paracetamol is the usual alternative.' },
  { title: 'Fall prevention', text: 'Patients over 65 get a fall-risk score on admission and bed alarms if the score is high.' },
];
const patientRecord = {
  bed: 12, name: 'Fatima Al-Harbi', age: 64, allergies: ['penicillin'],
  medications: ['warfarin 5 mg daily', 'amlodipine 5 mg daily'],
  diet: 'low salt', lastBloodPressure: '138/85', admissionReason: 'knee replacement',
  emergencyContactPhone: '0551234567', insurance: 'Plan B, member 99812',
};
const chatHistory = Array.from({ length: 30 }, (_, i) => `Turn ${i}: earlier small talk about shift handover and room cleaning.`);

// ---------------------------------------------------------------------------
// STEP 1: SELECT — only what helps answer THIS question
// ---------------------------------------------------------------------------
// A simple relevance test: keep policies sharing a key word with the question or the patient's meds.
// (Real systems use search or embeddings for this — concept 06 and lesson 04.)
const keywords = ['ibuprofen', 'nsaid', 'warfarin', 'pain'];
const relevantPolicies = policies.filter((p) => keywords.some((k) => p.text.toLowerCase().includes(k)));

// ---------------------------------------------------------------------------
// STEP 2: TRIM — only the fields the task needs (and nothing private it doesn't need)
// ---------------------------------------------------------------------------
const { name, age, allergies, medications } = patientRecord; // no phone, no insurance: not needed, and it's personal data

// ---------------------------------------------------------------------------
// STEP 3: COMPRESS — recent history only (here: last 2 turns)
// ---------------------------------------------------------------------------
const recentHistory = chatHistory.slice(-2);

// ---------------------------------------------------------------------------
// STEP 4: LAYOUT — clear labelled sections, instructions first, question last
// ---------------------------------------------------------------------------
const system = `You are a clinical assistant for ward nurses. Use ONLY the facts in <patient> and <policies>.
If the facts are not enough, say what is missing. Never give dosing amounts. Answer in two sentences.`;
const prompt = `<patient>
name: ${name}; age: ${age}; allergies: ${allergies.join(', ')}; current medications: ${medications.join(', ')}
</patient>
<policies>
${relevantPolicies.map((p) => `- ${p.title}: ${p.text}`).join('\n')}
</policies>
<recent_conversation>
${recentHistory.join('\n')}
</recent_conversation>
Question: ${question}`;

// ---------------------------------------------------------------------------
// Compare: everything vs. engineered context
// ---------------------------------------------------------------------------
const everything = JSON.stringify({ policies, patientRecord, chatHistory });
section('[A] What went into the context, and what we left out');
console.log(`Dump everything:     ≈ ${tokens(everything)} tokens (all ${policies.length} policies, full record incl. phone/insurance, ${chatHistory.length} chat turns)`);
console.log(`Engineered context:  ≈ ${tokens(system) + tokens(prompt)} tokens (${relevantPolicies.length} policy, 4 patient fields, ${recentHistory.length} turns)`);
console.log('\n--- system ---\n' + system + '\n--- user ---\n' + prompt);

// The raw values each step produced. Notice: SELECT kept 1 of 4 policies (the warfarin one);
// TRIM kept 4 fields and dropped the phone and insurance; COMPRESS kept the last 2 turns.
section('[A2] The raw output of each step');
dump('STEP 1 select → relevantPolicies', relevantPolicies);
dump('STEP 2 trim → the patient fields we kept', { name, age, allergies, medications });
dump('STEP 3 compress → recentHistory', recentHistory);

if (process.argv.includes('--offline')) process.exit(0);

section('[B] The model’s answer using the engineered context');
const result = await generateText({ model: chatModel(), instructions: system, prompt, temperature: 0, maxOutputTokens: 600 });
const { text, usage } = result;
console.log(stripThinking(text));
console.log('inputTokens counted by provider:', usage.inputTokens);
console.log('Look for: it mentions warfarin / bleeding risk — the one fact that matters, which we made sure was in the context.');

// We do NOT dump the whole generateText() result again: post 00 already showed it in full.
// We only print what matters here. `usage.inputTokens` (logged above) is close to our local estimate
// for the engineered context (not the "dump everything" number), and `finishReason` should be
// 'stop' — if it says 'length', raise maxOutputTokens: the answer was cut off.
console.log('finishReason:', result.finishReason);
