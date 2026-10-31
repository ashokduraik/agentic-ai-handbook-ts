/**
 * Post 08 — Tool calling   (read the blog post first: 08-tool-calling/README.md)
 *
 * We give the model one tool (getBedOccupancy). The model cannot run it — it ASKS for it.
 * The AI SDK runs our function, sends the result back, and repeats until the model answers,
 * at most 5 steps (stepCountIs(5)).
 *
 * Run:  npx tsx 08-tool-calling/example.ts      (your CHAT_MODEL must support tool calling)
 */
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { chatModel, dump, section, stripThinking } from '@learn/shared';

// Data the model cannot know (in real life: your hospital system's API).
const beds: Record<string, { total: number; occupied: number }> = {
  icu: { total: 12, occupied: 11 },
  cardiology: { total: 30, occupied: 22 },
  pediatrics: { total: 20, occupied: 9 },
};

// A tool = description (for the model to read) + input schema (checked before running) + execute (your code).
const getBedOccupancy = tool({
  description: 'Get current bed occupancy for ONE hospital ward. Call once per ward.',
  inputSchema: z.object({ ward: z.enum(['icu', 'cardiology', 'pediatrics']) }),
  execute: async ({ ward }) => {
    console.log(`  ↳ your code ran getBedOccupancy("${ward}")`);
    const b = beds[ward]!;
    return { ward, free: b.total - b.occupied };
  },
});

section('[A] The model asks for tools; the SDK runs them and loops');
const result = await generateText({
  model: chatModel(),
  tools: { getBedOccupancy },
  stopWhen: stepCountIs(5), // hard limit on the loop
  instructions: 'Answer questions about hospital capacity using the tools. Never guess numbers.',
  prompt: 'How many free beds are there in ICU and in cardiology combined?',
  temperature: 0,
});

section('[B] Step by step');
result.steps.forEach((step, i) => {
  console.log(`Step ${i + 1} (finishReason=${step.finishReason})`);
  step.toolCalls.forEach((c) => console.log(`   model asked:   ${c.toolName}(${JSON.stringify(c.input)})`));
  step.toolResults.forEach((r) => console.log(`   code returned: ${JSON.stringify(r.output)}`));
});

// The raw tool-call and tool-result objects, step by step. Notice: each tool call has a
// `toolCallId`, the `toolName` and the `input` the model chose; the matching tool result has the
// SAME `toolCallId`, the same `input`, and the `output` your execute() returned. That id is how
// the model pairs each answer with its question when several tools run in one step.
result.steps.forEach((step, i) => {
  dump(`steps[${i}].toolCalls`, step.toolCalls);
  dump(`steps[${i}].toolResults`, step.toolResults);
});

section('[C] Final answer');
console.log('Model:  ', stripThinking(result.text));
console.log('Correct: 1 + 8 = 9 free beds   ← compare! Small models can still get the arithmetic wrong.');

// The full result. Notice: `steps` now has MORE than one entry (one per model call), each with
// its own `finishReason` and `usage`. Top-level `content`, `toolCalls` and `toolResults` collect
// the parts of ALL steps; `text`, `finishReason` and `response` come from the LAST step; and
// `usage` / `totalUsage` add up the tokens of every step — the real cost of the whole loop.
section('[D] The full result object');
dump('generateText() result with tools', result);
