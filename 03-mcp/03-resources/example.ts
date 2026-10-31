/**
 * Post 03 — Resources: context the app reads   (read the blog post first: 03-resources/README.md)
 *
 * Tools are actions the MODEL chooses to call. Resources are read-only data the APP (or the user)
 * chooses to attach. Two kinds:
 *   - a static resource with a fixed URI:   clinic://departments
 *   - a resource TEMPLATE with a variable:  patient://{patientId}/appointments
 *
 * Run: npx tsx 03-resources/example.ts
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { dump, section } from '@learn/shared';
import { book, patients, appointments } from '../05-stdio-server/appointment-store.ts';

const server = new McpServer({ name: 'clinic-resources', version: '1.0.0' });

// --- 1. A static resource: one fixed URI ---------------------------------------
server.registerResource(
  'departments', // internal name
  'clinic://departments', // the URI clients use to read it
  { title: 'Departments', description: 'Departments and opening hours', mimeType: 'application/json' },
  async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify({ cardiology: 'Sun-Thu 08-16', orthopedics: 'Sun-Thu 09-17' }) }],
  }),
);

// --- 2. A resource template: one URI pattern, many resources ---------------------
server.registerResource(
  'patient-appointments',
  new ResourceTemplate('patient://{patientId}/appointments', {
    // optional: tell clients which concrete URIs exist right now (for a picker in the UI)
    list: async () => ({
      resources: patients.map((p) => ({ uri: `patient://${p.id}/appointments`, name: `${p.name} appointments` })),
    }),
  }),
  { title: 'Appointments of a patient', mimeType: 'application/json' },
  async (uri, { patientId }) => ({
    // `patientId` was parsed out of the URI for us
    contents: [{ uri: uri.href, text: JSON.stringify(appointments.filter((a) => a.patientId === patientId)) }],
  }),
);

const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await server.connect(serverSide);
const client = new Client({ name: 'resources-demo', version: '1.0.0' });
await client.connect(clientSide);

section('Discover');
const listedResources = await client.listResources();
const listedTemplates = await client.listResourceTemplates();
for (const r of listedResources.resources) console.log(`resource  ${r.uri.padEnd(32)} ${r.name}`);
for (const t of listedTemplates.resourceTemplates) console.log(`template  ${t.uriTemplate}`);
// The full results. Notice: listResources() includes BOTH the static resource and the concrete
// URIs the template's `list` callback produced (one per patient); listResourceTemplates() returns
// the pattern itself, `uriTemplate`, with the `{patientId}` placeholder.
dump('client.listResources() result', listedResources);
dump('client.listResourceTemplates() result', listedTemplates);

section('Read the static resource');
const depts = await client.readResource({ uri: 'clinic://departments' });
console.log((depts.contents[0] as { text: string }).text);
// The full resources/read result. Notice: `contents` is a list (one resource can return several
// parts), each with its `uri` and the data in `text` (or `blob` for binary data).
dump('client.readResource(clinic://departments) result', depts);

section('Read through the template');
book('P-001', 'S-1', 'chest pain follow-up'); // give Fatima an appointment in the fake backend
const fatima = await client.readResource({ uri: 'patient://P-001/appointments' });
console.log('patient://P-001/appointments →', (fatima.contents[0] as { text: string }).text);
// Notice: the `uri` is the concrete one you asked for, not the template; the text is a JSON string.
dump('client.readResource(patient://P-001/appointments) result', fatima);

section('How a host uses it: attach the resource to the prompt, no tool call needed');
const context = (fatima.contents[0] as { text: string }).text;
const prompt = `Patient appointments (JSON):\n${context}\n\nQuestion: what is Fatima booked for, and is it still active?`;
console.log(prompt);

await client.close();
