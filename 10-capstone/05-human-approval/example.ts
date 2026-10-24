/**
 * Post 05 — Human approval for write tools.
 * The same booking request runs twice: once without approval (denied), once with it (booked).
 * We check the store afterwards instead of trusting the model's words.
 *
 *   npm run post:05:offline   (a scripted model plays the tool calls)
 *   npm run post:05           (your CHAT_MODEL decides the tool calls)
 */
import { generateText, stepCountIs, type LanguageModel } from 'ai';
import { scriptedModel } from '@learn/07-observability/mock';
import { chatModel, modelLabel, section, stripThinking } from '@learn/shared';
import { connectFhirServer } from '../02-the-mcp-server/connect.ts';
import { ROLE_TOOLS, wrapTool, type Session } from '../04-least-privilege/access.ts';
import { approvalPolicy, writeToolsOf } from './approval.ts';

const offline = process.argv.includes('--offline');
const session: Session = { user: 'staff-17', role: 'receptionist', careTeam: ['P-001', 'P-003'] };
const question = 'Book Fatima Al-Harbi the earliest cardiology slot for a blood-pressure follow-up.';
const model = (): LanguageModel =>
  offline
    ? scriptedModel(
        { toolName: 'search_patients', input: { name: 'Fatima Al-Harbi' } },
        { toolName: 'find_slots', input: { specialty: 'cardiology' } },
        { toolName: 'book_appointment', input: { patientId: 'P-001', slotId: 'S-1', reason: 'BP follow-up' } },
        { text: 'Done.' },
      )
    : chatModel();

for (const approveWrites of [false, true]) {
  section(`${approveWrites ? '[B] With approval' : '[A] Without approval'} · ${offline ? 'scripted model' : modelLabel()}`);
  const mcp = await connectFhirServer(session.careTeam); // a fresh server = a fresh store
  try {
    const defs = await mcp.listTools();
    const visible = defs.tools.filter((t) => ROLE_TOOLS[session.role].includes(t.name));
    const raw = mcp.toolsFromDefinitions({ ...defs, tools: visible });
    const tools = Object.fromEntries(Object.entries(raw).map(([n, t]) => [n, wrapTool(t, session)]));

    // 3. toolApproval is checked by the AI SDK before execute() runs. A denied call never reaches the server.
    const r = await generateText({
      model: model(),
      instructions: 'You book appointments for clinic staff. Get ids from tools; never invent them. Answer in one sentence.',
      prompt: question,
      tools,
      toolApproval: approvalPolicy(writeToolsOf(visible), approveWrites),
      stopWhen: stepCountIs(6),
      temperature: 0,
    });

    for (const step of r.steps)
      for (const p of step.content as { type: string; toolName?: string; approved?: boolean; reason?: string; toolCall?: { toolName: string } }[]) {
        if (p.type === 'tool-call') console.log(`  call      ${p.toolName}`);
        if (p.type === 'tool-approval-response') console.log(`  approval  ${p.toolCall?.toolName}: ${p.approved ? 'approved' : `denied (${p.reason})`}`);
      }
    console.log('  answer:  ', stripThinking(r.text).replace(/\s+/g, ' ').slice(0, 160));

    // 4. Check the outcome in the store, not in the answer text.
    const booked = await raw.list_appointments!.execute!({ patientId: 'P-001' }, { toolCallId: 'check', messages: [], context: {} });
    console.log('  store:   ', (booked as { content: { text: string }[] }).content[0]!.text);
  } finally {
    await mcp.close();
  }
}
