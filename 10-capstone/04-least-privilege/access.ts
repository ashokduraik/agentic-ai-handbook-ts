/**
 * Access control, enforced by the host (our code), not by the model:
 * which tools a role may see, and which patients a user may touch.
 */
import type { ToolSet } from 'ai';
import { redactPII } from '../03-guards/guards.ts';

export type Role = 'receptionist' | 'clinician';
export interface Session {
  user: string;
  role: Role;
  careTeam: string[]; // patient ids this user may access (from your IAM / EHR in real life)
}

// 1. Least privilege: which MCP tools each role may even SEE. A tool the model never sees can't be misused.
export const ROLE_TOOLS: Record<Role, string[]> = {
  receptionist: ['search_patients', 'find_slots', 'list_appointments', 'book_appointment'],
  clinician: ['search_patients', 'find_slots', 'list_appointments', 'book_appointment', 'get_patient_summary', 'cancel_appointment'],
};

const redactDeep = <T>(v: T): T => JSON.parse(redactPII(JSON.stringify(v ?? null))) as T;

// 2. Wrap each tool: check the patient id BEFORE the call, redact the result BEFORE the model sees it.
export function wrapTool(t: ToolSet[string], session: Session): ToolSet[string] {
  const execute = t.execute;
  if (!execute) return t;
  return {
    ...t,
    execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
      const pid = (input as { patientId?: unknown })?.patientId;
      if (typeof pid === 'string' && !session.careTeam.includes(pid)) {
        // Host-side authorization: deny before the request ever reaches the server.
        return { isError: true, content: [{ type: 'text', text: `FORBIDDEN: ${pid} is not in your care team` }] };
      }
      return redactDeep(await execute(input, options));
    },
  } as ToolSet[string];
}
