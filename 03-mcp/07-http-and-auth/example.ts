/**
 * Post 07 — Remote MCP: Streamable HTTP + bearer-token auth   (read the blog post first: 07-http-and-auth/README.md)
 *
 * stdio (post 05) is for a server on YOUR machine. To share a server with many apps and users you run it
 * over HTTP. MCP's HTTP transport is called "Streamable HTTP": every message is a POST to one URL (/mcp).
 *
 * This file:
 *   1. starts a plain node:http server with an MCP endpoint (stateless: a fresh McpServer per request),
 *   2. checks a bearer token BEFORE MCP sees the request (401 if missing/unknown),
 *   3. passes the caller's identity to MCP as `req.auth`, so tool handlers can read `extra.authInfo`,
 *   4. connects three clients (no token, a viewer, a nurse) and shows what each may do.
 *
 * Run: npx tsx 07-http-and-auth/example.ts           (demo, then exits; no model)
 *      npx tsx 07-http-and-auth/example.ts --serve   (keep serving on http://localhost:3333/mcp for the Inspector)
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { dump, section } from '@learn/shared';
import { appointments, book } from '../05-stdio-server/appointment-store.ts';

// ---------------------------------------------------------------------------
// 1. Who is calling? A token → identity table. In real life: verify a JWT / ask your OAuth server.
// ---------------------------------------------------------------------------
type Role = 'viewer' | 'nurse';
const TOKENS: Record<string, { clientId: string; role: Role }> = {
  'demo-viewer-token': { clientId: 'reception-dashboard', role: 'viewer' },
  'demo-nurse-token': { clientId: 'ward-3-tablet', role: 'nurse' },
};

function authenticate(req: IncomingMessage): AuthInfo | undefined {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const who = token ? TOKENS[token] : undefined;
  if (!token || !who) return undefined;
  return { token, clientId: who.clientId, scopes: [], extra: { role: who.role } };
}

// ---------------------------------------------------------------------------
// 2. The MCP server. Tools read the caller from `extra.authInfo` (set from req.auth below).
// ---------------------------------------------------------------------------
function buildMcpServer() {
  const server = new McpServer({ name: 'clinic-remote', version: '1.0.0' });

  server.registerTool(
    'list_appointments',
    { description: 'List all appointments.', inputSchema: {}, annotations: { readOnlyHint: true } },
    async (_args, extra) => ({
      content: [{ type: 'text', text: `(for ${extra.authInfo?.clientId}) ${JSON.stringify(appointments)}` }],
    }),
  );

  server.registerTool(
    'cancel_appointment',
    { description: 'Cancel an appointment by id.', inputSchema: { appointmentId: z.string() }, annotations: { destructiveHint: true } },
    async ({ appointmentId }, extra) => {
      // AUTHORIZATION happens HERE, on the server, for every call. Never trust the client to hide a tool.
      const role = extra.authInfo?.extra?.role as Role | undefined;
      if (role !== 'nurse') return { isError: true, content: [{ type: 'text', text: `Forbidden: role "${role}" may not cancel` }] };
      const a = appointments.find((x) => x.id === appointmentId);
      if (!a) return { isError: true, content: [{ type: 'text', text: `No appointment ${appointmentId}` }] };
      a.status = 'cancelled';
      return { content: [{ type: 'text', text: `Cancelled ${appointmentId} (by ${extra.authInfo?.clientId})` }] };
    },
  );
  return server;
}

// ---------------------------------------------------------------------------
// 3. The HTTP layer: auth first, then hand the request to MCP's Streamable HTTP transport.
// ---------------------------------------------------------------------------
const http = createServer(async (req, res) => {
  if (req.url !== '/mcp') return void res.writeHead(404).end();
  if (req.method !== 'POST') return void res.writeHead(405).end(); // stateless: no GET stream, no sessions to DELETE

  const auth = authenticate(req);
  if (!auth) {
    // 401 + WWW-Authenticate is what the MCP auth spec expects; real servers also point to their OAuth metadata here.
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="clinic"', 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ error: 'invalid_token' }));
  }

  // Stateless mode: a fresh server + transport per request, no session id. Easy to scale behind a load balancer.
  const mcp = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void mcp.close();
  });
  await mcp.connect(transport);
  await transport.handleRequest(Object.assign(req, { auth }), res); // req.auth → extra.authInfo in tool handlers
});

book('P-001', 'S-1', 'chest pain follow-up'); // something to look at and cancel: appointment A-101

if (process.argv.includes('--serve')) {
  http.listen(3333, () => console.log('MCP over HTTP on http://localhost:3333/mcp  (tokens: demo-viewer-token, demo-nurse-token)'));
} else {
  await new Promise<void>((resolve) => http.listen(0, resolve)); // port 0 = any free port
  const url = new URL(`http://localhost:${(http.address() as AddressInfo).port}/mcp`);

  // A client that sends a bearer token on every request.
  async function connectAs(token?: string) {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const client = new Client({ name: 'http-demo', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
    return client;
  }
  const text = (r: Record<string, unknown>) => (r.content as { text: string }[] | undefined)?.[0]?.text;

  section('1. No token → the HTTP layer refuses before MCP runs');
  try {
    await connectAs();
  } catch (e) {
    console.log('connect failed:', (e as Error).message.slice(0, 120));
    // The error the client threw. Notice: `code` is the HTTP status (401): the request never reached MCP.
    dump('connect error', { name: (e as Error).name, code: (e as { code?: number }).code, message: (e as Error).message });
  }
  // The same refusal as a raw HTTP response (no MCP client), so you can see what the server sent.
  // Notice: status 401, the `WWW-Authenticate: Bearer` header the MCP auth spec asks for, and a JSON body.
  const raw401 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  dump('HTTP response without a token', {
    status: raw401.status,
    statusText: raw401.statusText,
    wwwAuthenticate: raw401.headers.get('www-authenticate'),
    json: await raw401.json(),
  });

  section('2. Viewer token → can read, cannot cancel');
  const viewer = await connectAs('demo-viewer-token');
  console.log('tools:', (await viewer.listTools()).tools.map((t) => t.name));
  const listed = await viewer.callTool({ name: 'list_appointments', arguments: {} });
  console.log('list  :', text(listed));
  const denied = await viewer.callTool({ name: 'cancel_appointment', arguments: { appointmentId: 'A-101' } });
  console.log('cancel → isError =', denied.isError, '|', text(denied));
  // Ordinary tools/call results (full shape: post 02), so we only log `isError` and the text. Notice:
  // list_appointments' text starts with "(for reception-dashboard)": the handler read the caller from
  // extra.authInfo. The refused cancel has `isError: true`: authorisation failed INSIDE the tool, not
  // at the HTTP layer.
  await viewer.close();

  section('3. Nurse token → allowed');
  const nurse = await connectAs('demo-nurse-token');
  const done = await nurse.callTool({ name: 'cancel_appointment', arguments: { appointmentId: 'A-101' } });
  console.log('cancel → isError =', done.isError ?? false, '|', text(done));
  // Notice: no `isError` (success), and the text names the caller the server authenticated.
  await nurse.close();

  http.close();
}
