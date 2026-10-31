/**
 * Post 08 — Approval policies: decide per call, from the ACTUAL arguments
 * (read the blog post first: 08-approval-policies/README.md)
 *
 *   `toolApproval` runs BEFORE execute(), for every tool call, and returns one of:
 *     'approved'                          → run it
 *     { type: 'denied', reason }          → don't run it; the model is told why
 *     'user-approval'                     → stop and ask a human; resume with their answer
 *
 *   A. A scripted model: one approved call, one denied call, one that needs a human.
 *      Then we play the human, approve it, and resume the conversation.
 *   B. Your CHAT_MODEL asked to cancel an appointment.
 *
 * Run:  npx tsx 08-approval-policies/example.ts            (A + B)
 *       npx tsx 08-approval-policies/example.ts --offline  (A only)
 * This file keeps the pending approval in memory only. Lesson 02 (LangGraph interrupt +
 * checkpointer) is how you make the pause survive a restart.
 */
import { generateText, stepCountIs, tool, type LanguageModel, type ModelMessage } from 'ai';
import { z } from 'zod';
import { chatModel, dump, section, stripThinking } from '@learn/shared';
import { scriptedModel } from '../support/mock-models.ts';

const careTeam = ['P-001']; // the logged-in doctor's patients
const ran: string[] = []; // proof of what really executed

const tools = {
  readRecord: tool({
    description: 'Read a patient record by id',
    inputSchema: z.object({ patientId: z.string() }),
    execute: async ({ patientId }) => (ran.push(`readRecord ${patientId}`), { patientId, dx: 'hypertension' }),
  }),
  cancelAppointment: tool({
    description: 'Cancel an appointment by id',
    inputSchema: z.object({ appointmentId: z.string() }),
    execute: async ({ appointmentId }) => (ran.push(`cancelAppointment ${appointmentId}`), { appointmentId, status: 'cancelled' }),
  }),
};

// The POLICY: plain, deterministic code. The model cannot talk its way past it.
const toolApproval = {
  readRecord: ({ patientId }: { patientId: string }) =>
    careTeam.includes(patientId) ? ('approved' as const) : { type: 'denied' as const, reason: `${patientId} is not in your care team` },
  cancelAppointment: 'user-approval' as const, // every cancellation needs a human "yes"
};

function printSteps(steps: Awaited<ReturnType<typeof generateText>>['steps']) {
  for (const step of steps) {
    // Every call gets an approval REQUEST. If the policy answered by itself, a RESPONSE follows.
    const answered = new Set(step.content.flatMap((p) => (p.type === 'tool-approval-response' ? [p.approvalId] : [])));
    for (const part of step.content) {
      if (part.type === 'tool-call') console.log(`  call     ${part.toolName}(${JSON.stringify(part.input)})`);
      if (part.type === 'tool-approval-request' && !answered.has(part.approvalId)) console.log(`  ⏸ waiting for a human (approvalId ${part.approvalId.slice(0, 12)}…)`);
      if (part.type === 'tool-approval-response') console.log(`  policy   ${part.approved ? 'approved' : `denied: ${part.reason}`}`);
      if (part.type === 'tool-result') console.log(`  result   ${JSON.stringify(part.output)}`);
    }
  }
}

async function ask(model: LanguageModel, messages: ModelMessage[], showParts = false) {
  const r = await generateText({
    model,
    tools,
    toolApproval,
    stopWhen: stepCountIs(4),
    instructions: 'You are a clinic assistant. Use tools. Be brief.',
    messages,
  });
  printSteps(r.steps);
  // Every tool and approval part, in full, for A1 and A2 only (the two shapes: decided by the policy,
  // and waiting for a human). Notice `tool-approval-request` carries the `approvalId` and the `toolCall`
  // it is about; a `tool-approval-response` from the policy has `approved` and `reason`. A call waiting
  // for a human has a request and no response, and no result. Other calls just log how many parts there were.
  const parts = r.steps.flatMap((s) => s.content.filter((p) => p.type.startsWith('tool-')));
  if (showParts) dump('tool and approval parts from every step', parts);
  else console.log('  tool and approval parts in steps:', parts.length);
  dump('finishReason', r.finishReason);
  // On a resume (the last message is our tool-approval-response), the approved tool runs BEFORE the
  // first model step, so it is in no step. Its output is in `initialResponseMessages` (a `tool` message
  // with the tool-result). The AI SDK exposes that field at runtime; TypeScript's GenerateTextResult
  // type does not, so we read it through a small cast. The rest of the result is in lesson 01, post 00.
  if (messages.at(-1)?.role === 'tool') {
    dump('initialResponseMessages', (r as typeof r & { initialResponseMessages: typeof r.responseMessages }).initialResponseMessages);
  }
  console.log('  model said:', stripThinking(r.text).slice(0, 120) || '(nothing yet — waiting for approval)');
  return r;
}

section('[A1] Own patient → approved; other patient → denied');
await ask(
  scriptedModel({ toolName: 'readRecord', input: { patientId: 'P-001' } }, { toolName: 'readRecord', input: { patientId: 'P-002' } }, { text: 'P-001 has hypertension. I cannot open P-002.' }),
  [{ role: 'user', content: 'Show P-001 and P-002' }],
  true,
);

section('[A2] Cancel → the loop STOPS and waits for a human');
ran.length = 0;
const model = scriptedModel({ toolName: 'cancelAppointment', input: { appointmentId: 'APT-7' } }, { text: 'APT-7 is cancelled.' });
const history: ModelMessage[] = [{ role: 'user', content: 'Cancel appointment APT-7' }];
const first = await ask(model, history, true);
console.log('  executed so far:', ran.length ? ran : 'nothing — no cancellation yet ✅');

section('[A3] The human approves → resume with their answer');
const pending = first.content.find((p) => p.type === 'tool-approval-request')!;
history.push(...first.response.messages, {
  role: 'tool',
  content: [{ type: 'tool-approval-response', approvalId: pending.approvalId, approved: true }],
});
// The whole history we send back. Notice the last message: the human's answer is just a `tool`
// message with a tool-approval-response for the same approvalId. That is the entire "resume" protocol.
dump('history sent to resume', history);
await ask(model, history);
console.log('  executed:', ran); // the approved call ran first, then the model answered

if (process.argv.includes('--offline')) process.exit(0);

section('[B] Your CHAT_MODEL asked to cancel (it must stop for approval)');
ran.length = 0;
await ask(chatModel(), [{ role: 'user', content: 'Please cancel appointment APT-9 using the tool.' }]);
console.log('  executed:', ran.length ? ran : 'nothing — waiting for a human');
