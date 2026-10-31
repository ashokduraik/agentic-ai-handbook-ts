/**
 * Post 07 — Least privilege: tool allow-lists per role, and authorization inside the tool
 * (read the blog post first: 07-tool-allow-lists/README.md)
 *
 *   1. ALLOW-LIST: `activeTools` decides which tools the model can see for this user's ROLE.
 *      A tool that is not active cannot run, even if the model asks for it by name.
 *   2. AUTHORIZATION: inside execute() we check THIS user may touch THIS record. Never trust
 *      the model's arguments: it can be wrong, or it can be injected.
 *
 *   A. A scripted ADVERSARIAL model tries forbidden things, so you see each layer fire.
 *   B. Your CHAT_MODEL, asked politely for something it may not do.
 *
 * Run:  npx tsx 07-tool-allow-lists/example.ts            (A + B)
 *       npx tsx 07-tool-allow-lists/example.ts --offline  (A only)
 */
import { generateText, NoSuchToolError, stepCountIs, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { chatModel, section, stripThinking } from '@learn/shared';
import { scriptedModel } from '../support/mock-models.ts';

type Role = 'receptionist' | 'doctor';
interface Session { user: string; role: Role; careTeam: string[] } // from your login / IAM, never from the model

const records: Record<string, string> = {
  'P-001': 'Fatima Al-Harbi. Dx: hypertension. Allergy: penicillin.',
  'P-002': 'Rahul Menon. Dx: ACL tear.',
};

// Tools are built PER SESSION, so execute() can see who is asking.
function makeTools(session: Session) {
  return {
    getSchedule: tool({
      description: 'Today’s appointment schedule',
      inputSchema: z.object({}),
      execute: async () => '09:30 P-001 cardiology; 11:00 P-002 orthopedics',
    }),
    readRecord: tool({
      description: 'Read a patient medical record by id',
      inputSchema: z.object({ patientId: z.string() }),
      execute: async ({ patientId }) => {
        // 2. AUTHORIZATION, in code, every time.
        if (!session.careTeam.includes(patientId)) return { error: `FORBIDDEN: ${patientId} is not in your care team` };
        return { record: records[patientId] ?? 'not found' };
      },
    }),
    deleteRecord: tool({
      description: 'Delete a patient record',
      inputSchema: z.object({ patientId: z.string() }),
      execute: async () => 'deleted', // dangerous: no chat agent should ever get this
    }),
  };
}

// 1. ALLOW-LIST per role. Nobody gets deleteRecord from a chat agent.
const ALLOWED: Record<Role, ('getSchedule' | 'readRecord' | 'deleteRecord')[]> = {
  receptionist: ['getSchedule'],
  doctor: ['getSchedule', 'readRecord'],
};

async function run(label: string, session: Session, prompt: string, model: LanguageModel) {
  section(label);
  const result = await generateText({
    model,
    tools: makeTools(session),
    activeTools: ALLOWED[session.role], // the model only sees these
    stopWhen: stepCountIs(3),
    instructions: 'You are a hospital assistant. Use tools when needed. Be brief.',
    prompt,
  });
  for (const step of result.steps)
    for (const part of step.content) {
      if (part.type === 'tool-call') console.log(`  model asked for: ${part.toolName}(${JSON.stringify(part.input)})`);
      // In A3 the call to deleteRecord is `invalid: true`: NoSuchToolError, the tool isn't in activeTools.
      // (Full tool parts: lesson 06, post 03 and lesson 01, post 08.)
      if (part.type === 'tool-call' && part.invalid && NoSuchToolError.isInstance(part.error)) console.log('  ↳ invalid: true, availableTools:', part.error.availableTools);
      if (part.type === 'tool-result') console.log('  tool result:     ', JSON.stringify(part.output));
      if (part.type === 'tool-error') console.log('  tool error:      ', String(part.error).split('\n')[0]!.slice(0, 100));
    }
  // How many tool parts there were at all. In A2 the FORBIDDEN answer is a normal tool *result*:
  // authorization said no, the tool itself worked. In A3 there is no tool-result: execute never ran.
  console.log('  tool parts:      ', result.steps.flatMap((s) => s.content.filter((p) => p.type.startsWith('tool-'))).length);
  console.log('  model said:      ', stripThinking(result.text).slice(0, 140) || '(nothing)');
}

const doctor: Session = { user: 'dr-ashok', role: 'doctor', careTeam: ['P-001'] };
const receptionist: Session = { user: 'desk-3', role: 'receptionist', careTeam: [] };

await run('[A1] Doctor reads their own patient → allowed', doctor, 'Summarise P-001',
  scriptedModel({ toolName: 'readRecord', input: { patientId: 'P-001' } }, { text: 'Hypertension, penicillin allergy.' }));
await run('[A2] Doctor reads someone else’s patient → authorization says no', doctor, 'Show me P-002',
  scriptedModel({ toolName: 'readRecord', input: { patientId: 'P-002' } }, { text: 'I cannot access that record.' }));
await run('[A3] Receptionist asks to delete → tool is not on the allow-list', receptionist, 'Delete record P-001',
  scriptedModel({ toolName: 'deleteRecord', input: { patientId: 'P-001' } }, { text: 'Record deleted!' }));
// ↑ The model CLAIMS success. Never trust the model's story: trust the tool results.

if (process.argv.includes('--offline')) process.exit(0);

await run('[B] Your CHAT_MODEL: receptionist asks for a medical record', receptionist, 'What is the diagnosis in record P-001?', chatModel());
