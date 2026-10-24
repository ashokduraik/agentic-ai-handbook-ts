/**
 * Capstone MCP server: a FHIR-flavoured clinical API exposed as MCP tools + resources.
 *
 * Design choices worth copying:
 *  - Tools return COMPACT projections, not raw FHIR bundles (raw FHIR burns context tokens and
 *    leaks fields the model doesn't need). Raw resources are still available as MCP *resources*.
 *  - The server enforces authorization itself (defence in depth): the caller's care team arrives
 *    as a claim (here: CALLER_CARE_TEAM env set by the host at spawn time; over HTTP it'd be an
 *    OAuth token). Never rely only on the agent/host to filter.
 *  - Annotations (readOnly/destructive) let hosts apply least privilege.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { allergies, appointments, bookSlot, displayName, medications, patients, slots } from '../01-the-fhir-data/fhir-store.ts';

const careTeam = new Set((process.env.CALLER_CARE_TEAM ?? '').split(',').filter(Boolean));
const log = (...a: unknown[]) => console.error('[fhir-mcp]', ...a);
const text = (v: unknown, isError = false) => ({ isError, content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v) }] });
const forbidden = (id: string) => text(`FORBIDDEN: ${id} is not in the caller's care team`, true);

const server = new McpServer({ name: 'fhir-clinic', version: '1.0.0' });

server.registerTool(
  'search_patients',
  {
    description: "Search the caller's patients by name. Returns patient ids for use with other tools.",
    inputSchema: { name: z.string().min(2) },
    annotations: { readOnlyHint: true },
  },
  async ({ name }) =>
    text(
      patients
        .filter((p) => careTeam.has(p.id) && displayName(p).toLowerCase().includes(name.toLowerCase()))
        .map((p) => ({ id: p.id, name: displayName(p), birthYear: p.birthDate.slice(0, 4) })),
    ),
);

server.registerTool(
  'get_patient_summary',
  {
    description: 'Clinical summary for one patient: allergies and active medications.',
    inputSchema: { patientId: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ patientId }) => {
    if (!careTeam.has(patientId)) return forbidden(patientId);
    const p = patients.find((x) => x.id === patientId);
    if (!p) return text(`Patient ${patientId} not found`, true);
    const ref = `Patient/${patientId}`;
    return text({
      id: p.id,
      name: displayName(p),
      nationalId: p.identifier[0]?.value, // sensitive — the host redacts this before the model sees it
      phone: p.telecom[0]?.value,
      allergies: allergies.filter((a) => a.patient.reference === ref).map((a) => `${a.code.text} (${a.criticality} criticality)`),
      activeMedications: medications
        .filter((m) => m.subject.reference === ref && m.status === 'active')
        .map((m) => `${m.medicationCodeableConcept.text} — ${m.dosageInstruction[0]?.text}`),
    });
  },
);

server.registerTool(
  'find_slots',
  {
    description: 'Free appointment slots for a specialty, earliest first.',
    inputSchema: { specialty: z.enum(['cardiology', 'orthopedics']) },
    annotations: { readOnlyHint: true },
  },
  async ({ specialty }) =>
    text(
      slots
        .filter((s) => s.status === 'free' && s.serviceType.some((t) => t.text === specialty))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((s) => ({ slotId: s.id, start: s.start, practitioner: s.comment })),
    ),
);

server.registerTool(
  'list_appointments',
  {
    description: "A patient's booked appointments.",
    inputSchema: { patientId: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ patientId }) => {
    if (!careTeam.has(patientId)) return forbidden(patientId);
    return text(appointments.filter((a) => a.status === 'booked' && a.participant[0]?.actor.reference === `Patient/${patientId}`));
  },
);

server.registerTool(
  'book_appointment',
  {
    description: 'Book a free slot for a patient. Requires ids from search_patients and find_slots.',
    inputSchema: { patientId: z.string(), slotId: z.string(), reason: z.string().max(200) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ patientId, slotId, reason }) => {
    if (!careTeam.has(patientId)) return forbidden(patientId);
    try {
      const a = bookSlot(patientId, slotId, reason);
      log('booked', a.id);
      return text({ appointmentId: a.id, status: a.status, start: a.start });
    } catch (e) {
      return text((e as Error).message, true);
    }
  },
);

server.registerTool(
  'cancel_appointment',
  {
    description: 'Cancel a booked appointment.',
    inputSchema: { appointmentId: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ appointmentId }) => {
    const a = appointments.find((x) => x.id === appointmentId);
    const pid = a?.participant[0]?.actor.reference.replace('Patient/', '');
    if (!a || !pid) return text(`Appointment ${appointmentId} not found`, true);
    if (!careTeam.has(pid)) return forbidden(pid);
    a.status = 'cancelled';
    const slotId = a.slot[0]?.reference.replace('Slot/', '');
    const s = slots.find((x) => x.id === slotId);
    if (s) s.status = 'free';
    return text({ appointmentId, status: 'cancelled' });
  },
);

// Raw FHIR for apps/humans (resources are read by the HOST, not invoked by the model).
server.registerResource(
  'patient',
  new ResourceTemplate('fhir://Patient/{id}', { list: undefined }),
  { title: 'FHIR Patient resource', mimeType: 'application/fhir+json' },
  async (uri, { id }) => {
    const p = patients.find((x) => x.id === id && careTeam.has(x.id));
    return { contents: [{ uri: uri.href, mimeType: 'application/fhir+json', text: p ? JSON.stringify(p) : '{}' }] };
  },
);

await server.connect(new StdioServerTransport());
log(`ready (care team: ${[...careTeam].join(',') || 'none'})`);
