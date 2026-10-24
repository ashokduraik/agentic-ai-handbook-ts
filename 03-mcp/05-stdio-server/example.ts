/**
 * Post 05 — A real stdio server, inspected by a client   (read the blog post first: 05-stdio-server/README.md)
 *
 * server.ts (in this folder) is a complete MCP server: the tools from post 02, the resources from post 03
 * and the prompt from post 04, over the STDIO transport. This file is the CLIENT side:
 * it starts the server as a child process (spawn.ts) and talks to it. NO LLM involved.
 * This is exactly what a host (Claude Desktop, Cursor, VS Code, your agent) does under the hood:
 *   spawn → initialize → list capabilities → call a tool / read a resource / get a prompt.
 *
 * Run: npx tsx 05-stdio-server/example.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { section } from '@learn/shared';
import { serverProcess } from './spawn.ts';

const client = new Client({ name: 'inspect-client', version: '1.0.0' });
await client.connect(new StdioClientTransport(serverProcess)); // starts `node --import tsx server.ts`

section('Discovery');
const { tools } = await client.listTools();
for (const t of tools) console.log(`tool  ${t.name.padEnd(20)} hints=${JSON.stringify(t.annotations ?? {})}`);
for (const r of (await client.listResources()).resources) console.log(`res   ${r.uri}`);
for (const r of (await client.listResourceTemplates()).resourceTemplates) console.log(`tmpl  ${r.uriTemplate}`);
for (const p of (await client.listPrompts()).prompts) console.log(`prompt ${p.name}`);

section('Call tools in another process');
const slots = await client.callTool({ name: 'search_slots', arguments: { department: 'cardiology' } });
console.log('structuredContent:', JSON.stringify(slots.structuredContent));
const booked = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-001', slotId: 'S-1', reason: 'chest pain follow-up' } });
console.log('book:', JSON.stringify(booked.content));
const again = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-002', slotId: 'S-1', reason: 'x' } });
console.log('double-book → isError =', again.isError, JSON.stringify(again.content));

section('Bad arguments are rejected by the server-side schema');
const bad = await client.callTool({ name: 'search_slots', arguments: { department: 'dermatology' } });
console.log('isError =', bad.isError, String((bad.content as { text: string }[])[0]?.text).slice(0, 160));

section('Resources & prompts');
const res = await client.readResource({ uri: 'patient://P-001/appointments' });
console.log('patient://P-001/appointments →', (res.contents[0] as { text: string }).text);
const prompt = await client.getPrompt({
  name: 'confirmation-sms',
  arguments: { patientName: 'Fatima', when: '3 Nov 09:30', doctor: 'Dr. Qureshi' },
});
console.log('prompt →', JSON.stringify(prompt.messages[0]?.content));

await client.close(); // also stops the server child process
