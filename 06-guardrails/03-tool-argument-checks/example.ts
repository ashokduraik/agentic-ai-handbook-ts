/**
 * Post 03 — Check the model's tool ARGUMENTS before your code runs
 * (read the blog post first: 03-tool-argument-checks/README.md)
 *
 *   A. A scripted (fake) model sends a bad argument, then a good one. The tool's Zod
 *      inputSchema rejects the bad call BEFORE execute() runs; the SDK sends the error back to
 *      the model as a tool-error, and the model gets another chance. No real model needed.
 *   B. The same tool with your CHAT_MODEL.
 *
 * Run:  npx tsx 03-tool-argument-checks/example.ts            (A + B)
 *       npx tsx 03-tool-argument-checks/example.ts --offline  (A only)
 */
import { generateText, stepCountIs, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { chatModel, section, stripThinking } from '@learn/shared';
import { scriptedModel } from '../support/mock-models.ts';

const executed: string[] = []; // proof of which calls really reached our code

// The inputSchema is a CONTRACT. Make it as strict as the real API behind the tool.
const refillPrescription = tool({
  description: 'Request a refill of an existing prescription for a patient. Patient ids look like P-001.',
  inputSchema: z.object({
    patientId: z.string().regex(/^P-\d{3}$/, 'patientId must look like P-001 (use the id, not the name)'),
    drug: z.enum(['amlodipine', 'metformin', 'atorvastatin']), // only drugs this clinic refills
    days: z.int().min(7).max(90), // no 1000-day refills
  }),
  execute: async ({ patientId, drug, days }) => {
    executed.push(`${patientId}/${drug}/${days}`);
    return { status: 'queued', patientId, drug, days };
  },
});

async function run(model: LanguageModel, prompt: string) {
  const result = await generateText({
    model,
    tools: { refillPrescription },
    stopWhen: stepCountIs(4),
    instructions: 'You request prescription refills. Patient Fatima Al-Harbi has id P-001.',
    prompt,
    temperature: 0,
  });
  // Print every tool event so you can see the rejected call and the retry.
  for (const step of result.steps)
    for (const part of step.content) {
      if (part.type === 'tool-error') console.log('  ❌ tool-error  ', JSON.stringify(part.input), '→', String(part.error).split('\n')[0]!.slice(0, 90));
      if (part.type === 'tool-result') console.log('  ✅ tool-result ', JSON.stringify(part.input), '→', JSON.stringify(part.output));
    }
  console.log('  model said:', stripThinking(result.text).slice(0, 160));
  console.log('  execute() really ran for:', executed.length ? executed.join(', ') : 'nothing');
}

section('[A] Scripted model: bad arguments first, then good ones');
await run(
  scriptedModel(
    { toolName: 'refillPrescription', input: { patientId: 'Fatima Al-Harbi', drug: 'amlodipine', days: 365 } }, // ✗ name, ✗ days
    { toolName: 'refillPrescription', input: { patientId: 'P-001', drug: 'amlodipine', days: 30 } }, // ✓
    { text: 'Refill for amlodipine (30 days) is queued.' },
  ),
  'Refill Fatima’s amlodipine for a year.',
);

if (process.argv.includes('--offline')) process.exit(0);

section('[B] Your CHAT_MODEL');
executed.length = 0;
await run(chatModel(), 'Please refill amlodipine for Fatima Al-Harbi for 30 days.');
