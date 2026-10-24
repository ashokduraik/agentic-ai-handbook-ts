/**
 * Post 07 — Structured output (typed JSON with Zod)   (read the blog post first: 07-structured-output/README.md)
 *
 *   A. A Zod SCHEMA describes the shape we want; we check data against it (no model).
 *   B. Output.object({ schema }) makes the model fill that shape from a messy note; the SDK
 *      validates the reply and gives us a typed object — or throws NoObjectGeneratedError.
 *
 * Run:  npx tsx 07-structured-output/example.ts            (A + B)
 *       npx tsx 07-structured-output/example.ts --offline  (A only)
 */
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import { chatModel, section } from '@learn/shared';

// ---------------------------------------------------------------------------
// The schema: the exact shape of a booking request
// ---------------------------------------------------------------------------
// `.describe()` texts are sent to the model as instructions for each field.
export const AppointmentRequest = z.object({
  patientName: z.string().describe('Full name as written in the note'),
  department: z // ENUM: only these values are allowed
    .enum(['cardiology', 'orthopedics', 'pediatrics', 'general-medicine', 'unknown'])
    .describe('Best matching department; "unknown" if unclear'),
  urgency: z.enum(['routine', 'soon', 'urgent']).describe('urgent = within 24h'),
  preferredDate: z.string().nullable().describe('ISO date YYYY-MM-DD if mentioned, otherwise null'), // NULLABLE: an honest "not mentioned"
  symptoms: z.array(z.string()).describe('Short symptom phrases, may be empty'),
});
// The TypeScript type comes FROM the schema — one source of truth.
export type AppointmentRequest = z.infer<typeof AppointmentRequest>;

// ---------------------------------------------------------------------------
// Part A: validation without a model
// ---------------------------------------------------------------------------
section('[A] Check data against the schema (no model)');
const good = { patientName: 'Rahul Menon', department: 'orthopedics', urgency: 'routine', preferredDate: null, symptoms: ['knee pain'] };
const bad = { patientName: 'X', department: 'neuro', urgency: 'asap', preferredDate: '3rd Nov', symptoms: [] };
console.log('good →', AppointmentRequest.safeParse(good).success ? 'valid' : 'invalid');
const r = AppointmentRequest.safeParse(bad);
console.log('bad  →', r.success ? 'valid' : 'invalid\n' + z.prettifyError(r.error));

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part B: ask the model for structured output
// ---------------------------------------------------------------------------
section('[B] Free-text note → typed object from the model');
const note = 'Called at 9am: Mrs. Fatima Al-Harbi wants to see a heart doctor, chest tightness on the stairs since last week. Prefers 2026-11-03 if possible.';
console.log('Note:', note);
try {
  const { output } = await generateText({
    model: chatModel(),
    output: Output.object({ schema: AppointmentRequest }), // "reply with JSON matching this schema"
    instructions: 'Extract a structured appointment request from the note. Do not invent facts.',
    prompt: note,
    temperature: 0,
  });
  // `output` is typed AppointmentRequest and already validated — no JSON.parse, no casting.
  console.log(JSON.stringify(output, null, 2));
  console.log('Typed access → output.department =', output.department);
} catch (error) {
  // The failure path: reply was not valid JSON or did not match the schema.
  if (NoObjectGeneratedError.isInstance(error)) console.error('Did not match the schema. Raw reply:\n', error.text);
  else throw error;
}
