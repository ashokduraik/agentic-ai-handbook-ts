/**
 * Post 02 — Validate every model output, and repair instead of failing
 * (read the blog post first: 02-validate-and-repair/README.md)
 *
 *   A. Two layers of checks on a prescription, with no model:
 *        1. the SHAPE (Zod schema)            2. the BUSINESS RULES (Zod refinements)
 *   B. A repair loop: when the model's answer fails a check, send the exact error back and
 *      ask again (at most 3 times). If it still fails, FAIL CLOSED with a clear typed result.
 *
 * Run:  npx tsx 02-validate-and-repair/example.ts            (A + B)
 *       npx tsx 02-validate-and-repair/example.ts --offline  (A only)
 */
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import { chatModel, dump, section } from '@learn/shared';

const today = '2026-10-22';

// ---------------------------------------------------------------------------
// Layer 1: the shape. This schema is SENT to the model (as JSON Schema).
// ---------------------------------------------------------------------------
const Prescription = z.object({
  drug: z.string().min(2),
  doseMg: z.number().positive(),
  timesPerDay: z.int().min(1).max(6),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ---------------------------------------------------------------------------
// Layer 2: business rules. Checked locally after parsing; JSON Schema can't express them.
// ---------------------------------------------------------------------------
const SafePrescription = Prescription.refine((p) => p.startDate >= today, {
  message: `startDate must be today (${today}) or later`,
  path: ['startDate'],
}).refine((p) => !(p.drug.toLowerCase() === 'paracetamol' && p.doseMg * p.timesPerDay > 4000), {
  message: 'paracetamol total daily dose must not exceed 4000 mg',
  path: ['doseMg'],
});

section('[A] Shape + business rules, no model');
const ok = { drug: 'Amoxicillin', doseMg: 500, timesPerDay: 3, startDate: '2026-10-25' };
const tooMuch = { drug: 'Paracetamol', doseMg: 2000, timesPerDay: 4, startDate: '2026-10-23' };
console.log('ok      →', SafePrescription.safeParse(ok).success ? 'valid' : 'invalid');
const r = SafePrescription.safeParse(tooMuch);
console.log('tooMuch →', r.success ? 'valid' : 'invalid\n' + z.prettifyError(r.error));
// What the parse result holds is shown in lesson 01, post 07. Here: each issue's `code` and `path` (the
// field to blame). That is what we feed back to the model in part B.
if (!r.success) for (const i of r.error.issues) console.log(`  issue: code=${i.code} path=${i.path.join('.')}`);

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part B: validate → repair → fail closed
// ---------------------------------------------------------------------------
async function extractWithRepair(text: string, maxAttempts = 3) {
  let feedback = ''; // what went wrong last time, in words the model can act on
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { output } = await generateText({
        model: chatModel(),
        temperature: 0,
        output: Output.object({ schema: Prescription }), // layer 1 is enforced by the SDK
        instructions: `Today is ${today}. Extract the prescription. Use ISO dates.`,
        prompt: `Prescription: "${text}"${feedback}`,
      });
      // The parsed structured output of this attempt (the shape is in lesson 01, post 07). It already
      // matches the SHAPE (layer 1, checked by the SDK); whether it is SAFE is decided on the next line.
      console.log(`  attempt ${attempt}: model answered`, JSON.stringify(output));
      const checked = SafePrescription.safeParse(output); // layer 2 is enforced by us
      if (checked.success) return { ok: true as const, value: checked.data, attempts: attempt };
      feedback = `\n\nYour previous answer ${JSON.stringify(output)} broke these rules:\n${z.prettifyError(checked.error)}\nFix it if the text allows; never invent a safer dose.`;
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) throw e; // network/auth errors are not ours to repair
      // Why the SDK gave up (the full error is in lesson 01, post 07). `text` is what the model actually
      // wrote: that is what we quote back to the model.
      console.log(`  attempt ${attempt}: NoObjectGeneratedError, model wrote`, e.text);
      feedback = `\n\nYour previous answer ${e.text ?? ''} was not valid JSON for the schema. Return only valid JSON.`;
    }
    console.log(`  attempt ${attempt} failed → asking again with feedback: ${feedback.replace(/\n/g, ' ').slice(0, 140)}…`);
  }
  // FAIL CLOSED: never pass an unsafe value downstream. The caller must handle this branch.
  return { ok: false as const, reason: 'could not produce a valid, safe prescription — send to a pharmacist', attempts: maxAttempts };
}

section('[B1] A normal prescription');
// The full return value: ok + value + attempts, or ok: false + reason. The caller branches on `ok`.
dump('extractWithRepair() result', await extractWithRepair('Amoxicillin 500 mg three times a day starting 2026-10-25'));

section('[B2] An unsafe prescription → repair attempts, then fail closed');
dump('extractWithRepair() result', await extractWithRepair('Paracetamol 2000 mg four times daily from tomorrow'));
