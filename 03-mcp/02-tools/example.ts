/**
 * Post 02 — Tools in depth   (read the blog post first: 02-tools/README.md)
 *
 * Four tools that each show one feature of MCP tools:
 *   find_patient      → inputSchema + readOnlyHint
 *   search_slots      → outputSchema: a typed, machine-readable result (structuredContent)
 *   book_appointment  → isError: a business failure the MODEL should see and react to
 *   cancel_appointment→ destructiveHint: metadata a host can use to hide or gate the tool
 * Then we call them, including two failure kinds: a business error, and invalid arguments.
 *
 * Uses the in-memory pipe from post 01 and the fake clinic backend from post 05's folder.
 * Run: npx tsx 02-tools/example.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { dump, section } from '@learn/shared';
import { appointments, book, patients, slots } from '../05-stdio-server/appointment-store.ts';

const server = new McpServer({ name: 'clinic-tools', version: '1.0.0' });

// --- 1. Input schema + a read-only hint --------------------------------------
server.registerTool(
  'find_patient',
  {
    title: 'Find patient',
    description: 'Find patients by (partial) name. Returns ids needed by other tools.',
    inputSchema: { query: z.string().min(2).describe('Part of the patient name') }, // .describe() text reaches the model
    annotations: { readOnlyHint: true }, // "calling me changes nothing"
  },
  async ({ query }) => {
    const hits = patients.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    return { content: [{ type: 'text', text: JSON.stringify(hits) }] };
  },
);

// --- 2. A typed result with outputSchema ---------------------------------------
server.registerTool(
  'search_slots',
  {
    title: 'Search free slots',
    description: 'List free appointment slots for a department.',
    inputSchema: { department: z.enum(['cardiology', 'orthopedics', 'pediatrics', 'general-medicine']) },
    outputSchema: { slots: z.array(z.object({ id: z.string(), doctor: z.string(), start: z.string() })) },
    annotations: { readOnlyHint: true },
  },
  async ({ department }) => {
    const free = slots.filter((s) => s.department === department && s.free).map(({ id, doctor, start }) => ({ id, doctor, start }));
    return {
      structuredContent: { slots: free }, // checked against outputSchema; code can use it directly
      content: [{ type: 'text', text: JSON.stringify(free) }], // text copy for the model and older clients
    };
  },
);

// --- 3. Business errors with isError ------------------------------------------
server.registerTool(
  'book_appointment',
  {
    title: 'Book appointment',
    description: 'Book a free slot for a patient. Use ids from find_patient and search_slots.',
    inputSchema: { patientId: z.string(), slotId: z.string(), reason: z.string().max(200) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ patientId, slotId, reason }) => {
    try {
      const appt = book(patientId, slotId, reason);
      return { content: [{ type: 'text', text: `Booked ${appt.id} (slot ${slotId}) for ${patientId}.` }] };
    } catch (e) {
      // Don't throw: return the problem as a RESULT, so the model can read it and try another slot.
      return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
    }
  },
);

// --- 4. A destructive tool, labelled as such ------------------------------------
server.registerTool(
  'cancel_appointment',
  {
    title: 'Cancel appointment',
    description: 'Cancel an appointment by id.',
    inputSchema: { appointmentId: z.string() },
    annotations: { destructiveHint: true }, // a HINT for the host, not a security control
  },
  async ({ appointmentId }) => {
    const a = appointments.find((x) => x.id === appointmentId);
    if (!a) return { isError: true, content: [{ type: 'text', text: `No appointment ${appointmentId}` }] };
    a.status = 'cancelled';
    return { content: [{ type: 'text', text: `Cancelled ${appointmentId}` }] };
  },
);

// ---------------------------------------------------------------------------
// The client side: what a host sees and gets back
// ---------------------------------------------------------------------------
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await server.connect(serverSide);
const client = new Client({ name: 'tools-demo', version: '1.0.0' });
await client.connect(clientSide);
const text = (r: Record<string, unknown>) => (r.content as { text: string }[] | undefined)?.[0]?.text;

section('What the model is shown for one tool (name + description + JSON Schema)');
const { tools } = await client.listTools();
console.log(JSON.stringify(tools.find((t) => t.name === 'book_appointment'), null, 2));
for (const t of tools) console.log(`${t.name.padEnd(20)} annotations=${JSON.stringify(t.annotations ?? {})}`);

section('A typed result: structuredContent');
const found = await client.callTool({ name: 'search_slots', arguments: { department: 'cardiology' } });
const { slots: free } = found.structuredContent as { slots: { id: string; start: string }[] };
console.log('first free slot, read by CODE:', free[0]?.id, free[0]?.start);
// The full result. Notice: the SAME data twice: `structuredContent` (an object, checked against
// outputSchema, for code) and `content[0].text` (a JSON string, for the model).
dump('callTool(search_slots) result', found);

section('Success, then a business error (isError)');
const ok = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-001', slotId: 'S-1', reason: 'chest pain follow-up' } });
console.log('book S-1 for P-001 → isError =', ok.isError ?? false, '|', text(ok));
const taken = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-002', slotId: 'S-1', reason: 'check-up' } });
console.log('book S-1 for P-002 → isError =', taken.isError, '|', text(taken));
// Both results side by side. Notice: the success has NO `isError` field at all (absent means false);
// the failure has `isError: true` and the reason as ordinary text content the model can read.
dump('callTool(book_appointment) — success', ok);
dump('callTool(book_appointment) — business error', taken);

section('Invalid arguments: rejected by the schema, the handler never runs');
const bad = await client.callTool({ name: 'search_slots', arguments: { department: 'dermatology' } });
console.log('isError =', bad.isError, '|', text(bad)?.slice(0, 160));
// The full result. Notice: invalid arguments do NOT throw on the client: they come back as a normal
// result with `isError: true`, and the text lists the Zod validation issues (path, allowed values).
dump('callTool(search_slots, bad args) result', bad);

await client.close();
