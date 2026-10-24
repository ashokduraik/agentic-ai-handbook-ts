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
import { chatModel, section, stripThinking } from '@learn/shared';

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

section('[C] Final answer');
console.log('Model:  ', stripThinking(result.text));
console.log('Correct: 1 + 8 = 9 free beds   ← compare! Small models can still get the arithmetic wrong.');
