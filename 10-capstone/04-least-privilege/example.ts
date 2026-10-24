/**
 * Post 04 — Least privilege and authorization, outside the model.
 * Shows which tools each role gets, and what the wrapped tools do with a forbidden id and with PII.
 *
 *   npm run post:04      (no model needed)
 */
import { section } from '@learn/shared';
import { connectFhirServer } from '../02-the-mcp-server/connect.ts';
import { ROLE_TOOLS, wrapTool, type Role, type Session } from './access.ts';

const session = (role: Role): Session => ({ user: 'staff-17', role, careTeam: ['P-001', 'P-003'] });
const call = { toolCallId: 'demo', messages: [], context: {} };
const textOf = (r: unknown) => ((r as { content?: { text: string }[] }).content ?? []).map((c) => c.text).join('');

const mcp = await connectFhirServer(session('clinician').careTeam);
try {
  // 1. Filter the server's tools by role BEFORE handing them to the model.
  section('[A] What each role can see');
  const defs = await mcp.listTools();
  for (const role of ['receptionist', 'clinician'] as const) {
    const visible = defs.tools.filter((t) => ROLE_TOOLS[role].includes(t.name)).map((t) => t.name);
    console.log(`  ${role.padEnd(13)} ${visible.join(', ')}`);
  }

  // 2. Wrap the clinician's tools with the host checks.
  const s = session('clinician');
  const visible = defs.tools.filter((t) => ROLE_TOOLS[s.role].includes(t.name));
  const raw = mcp.toolsFromDefinitions({ ...defs, tools: visible });
  const summary = wrapTool(raw.get_patient_summary!, s);

  section('[B] A patient outside the care team: stopped by the host');
  console.log(' ', textOf(await summary.execute!({ patientId: 'P-002' }, call)));

  section('[C] A patient in the care team: raw result vs what the model gets');
  console.log('  raw:    ', textOf(await raw.get_patient_summary!.execute!({ patientId: 'P-001' }, call)));
  console.log('  wrapped:', textOf(await summary.execute!({ patientId: 'P-001' }, call)));

  // 3. Small models often pass a NAME where an id is expected. The check still holds.
  section('[D] A name instead of an id');
  console.log(' ', textOf(await summary.execute!({ patientId: 'Fatima Al-Harbi' }, call)));
} finally {
  await mcp.close();
}
