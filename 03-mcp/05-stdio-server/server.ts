/**
 * Post 05 — The full clinic MCP server   (read the blog post first: 05-stdio-server/README.md)
 *
 * An MCP server exposing a mock appointment API (see appointment-store.ts).
 *
 * MCP's three primitives:
 *  - TOOLS      — actions the MODEL may invoke (with JSON-Schema'd input, optional typed output).
 *  - RESOURCES  — read-only context the APP/USER attaches (addressed by URI, can be templated).
 *  - PROMPTS    — reusable, parameterised prompt templates the USER picks.
 *
 * Transport here is stdio (the client spawns this process). RULE: never write to stdout
 * in a stdio server except via the transport — logs go to stderr.
 *
 * Run standalone (it just waits for JSON-RPC on stdin): npx tsx 05-stdio-server/server.ts
 * Normally it's spawned by a client (05-stdio-server/example.ts, 06-agent-over-mcp/example.ts) or by any MCP host
 * (Claude Desktop, Cursor, VS Code, MCP Inspector: `npx @modelcontextprotocol/inspector npx tsx 05-stdio-server/server.ts`).
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { appointments, book, patients, slots } from './appointment-store.ts';

const log = (...a: unknown[]) => console.error('[mcp-server]', ...a); // stderr!

const server = new McpServer({ name: 'clinic-scheduling', version: '1.0.0' });

// ---------------------------------------------------------------- tools
server.registerTool(
  'find_patient',
  {
    title: 'Find patient',
    description: 'Find patients by (partial) name. Returns ids needed by other tools.',
    inputSchema: { query: z.string().min(2).describe('Part of the patient name') },
    annotations: { readOnlyHint: true },
  },
  async ({ query }) => {
    const hits = patients.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    return { content: [{ type: 'text', text: JSON.stringify(hits) }] };
  },
);

server.registerTool(
  'search_slots',
  {
    title: 'Search free slots',
    description: 'List free appointment slots for a department.',
    inputSchema: { department: z.enum(['cardiology', 'orthopedics', 'pediatrics', 'general-medicine']) },
    // outputSchema => the result carries machine-readable structuredContent, validated by clients.
    outputSchema: { slots: z.array(z.object({ id: z.string(), doctor: z.string(), start: z.string() })) },
    annotations: { readOnlyHint: true },
  },
  async ({ department }) => {
    const free = slots.filter((s) => s.department === department && s.free).map(({ id, doctor, start }) => ({ id, doctor, start }));
    return {
      structuredContent: { slots: free },
      content: [{ type: 'text', text: JSON.stringify(free) }], // text fallback for older clients
    };
  },
);

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
      log('booked', appt.id);
      return { content: [{ type: 'text', text: `Booked ${appt.id} (slot ${slotId}) for ${patientId}.` }] };
    } catch (e) {
      // Tool-level errors go back to the MODEL (isError) so it can correct itself,
      // rather than crashing the protocol.
      return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
    }
  },
);

server.registerTool(
  'cancel_appointment',
  {
    title: 'Cancel appointment',
    description: 'Cancel an appointment by id.',
    inputSchema: { appointmentId: z.string() },
    // Hints are advisory metadata a HOST can use to gate calls (see 06-agent-over-mcp/example.ts).
    annotations: { destructiveHint: true },
  },
  async ({ appointmentId }) => {
    const a = appointments.find((x) => x.id === appointmentId);
    if (!a) return { isError: true, content: [{ type: 'text', text: `No appointment ${appointmentId}` }] };
    a.status = 'cancelled';
    const slot = slots.find((s) => s.id === a.slotId);
    if (slot) slot.free = true;
    return { content: [{ type: 'text', text: `Cancelled ${appointmentId}` }] };
  },
);

// ---------------------------------------------------------------- resources
server.registerResource(
  'departments',
  'clinic://departments',
  { title: 'Departments', description: 'Departments and opening hours', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify({ cardiology: 'Sun-Thu 08-16', orthopedics: 'Sun-Thu 09-17' }) }],
  }),
);

server.registerResource(
  'patient-appointments',
  new ResourceTemplate('patient://{patientId}/appointments', {
    list: async () => ({
      resources: patients.map((p) => ({ uri: `patient://${p.id}/appointments`, name: `${p.name} appointments` })),
    }),
  }),
  { title: 'Appointments of a patient', mimeType: 'application/json' },
  async (uri, { patientId }) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(appointments.filter((a) => a.patientId === patientId)) }],
  }),
);

// ---------------------------------------------------------------- prompts
server.registerPrompt(
  'confirmation-sms',
  {
    title: 'Appointment confirmation SMS',
    description: 'Draft a short, friendly SMS confirming an appointment',
    argsSchema: { patientName: z.string(), when: z.string(), doctor: z.string() },
  },
  ({ patientName, when, doctor }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a <160 character SMS to ${patientName} confirming their appointment with ${doctor} at ${when}. No medical advice.`,
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
log('ready on stdio');
