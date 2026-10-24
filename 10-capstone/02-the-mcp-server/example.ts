/**
 * Post 02 — The MCP server.
 * Talks to fhir-mcp-server.ts the way any MCP host would, with no model involved:
 * list the tools and their annotations, call two tools, and read a resource.
 *
 *   npm run post:02      (no model needed)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { section } from '@learn/shared';
import { serverPath } from './connect.ts';

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text).join('');

// 1. Start the server as a child process. The caller's care team is passed in as a claim.
const client = new Client({ name: 'post-02', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...(process.env as Record<string, string>), CALLER_CARE_TEAM: 'P-001,P-003' },
    stderr: 'ignore',
  }),
);

try {
  // 2. Every tool says whether it only reads, or writes (and whether the write is destructive).
  section('[A] Tools and their annotations');
  for (const t of (await client.listTools()).tools) {
    const a = t.annotations ?? {};
    const kind = a.readOnlyHint ? 'read-only' : a.destructiveHint ? 'WRITE, destructive' : 'WRITE';
    console.log(`  ${t.name.padEnd(20)} ${kind.padEnd(20)} ${t.description}`);
  }

  // 3. Tools return compact projections: ids the model can pass to the next tool.
  section('[B] search_patients({ name: "Fatima" })');
  console.log(' ', textOf(await client.callTool({ name: 'search_patients', arguments: { name: 'Fatima' } })));

  // 4. The server checks the care team itself, whatever the host or model asked for.
  section('[C] get_patient_summary for a patient outside the care team');
  const denied = await client.callTool({ name: 'get_patient_summary', arguments: { patientId: 'P-002' } });
  console.log(`  isError=${denied.isError}  ${textOf(denied)}`);

  // 5. Resources are raw data for the host app to read; the model doesn't call them.
  section('[D] Resource fhir://Patient/P-003');
  const res = await client.readResource({ uri: 'fhir://Patient/P-003' });
  console.log(' ', (res.contents[0] as { text: string }).text.slice(0, 120), '…');
} finally {
  await client.close();
}
