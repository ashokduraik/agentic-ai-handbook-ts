/**
 * Post 01 — What is MCP?   (read the blog post first: 01-what-is-mcp/README.md)
 *
 * The smallest possible MCP server and client, in ONE file, talking over an in-memory pipe.
 * We print every JSON-RPC message that crosses the pipe, so you can see the protocol itself:
 *   initialize → tools/list → tools/call
 *
 * No model is involved: MCP is just a protocol between an app (the client) and a tool provider (the server).
 *
 * Run: npx tsx 01-what-is-mcp/example.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { section } from '@learn/shared';

// ---------------------------------------------------------------------------
// 1. The SERVER: wraps "your API" and describes it in a standard way
// ---------------------------------------------------------------------------
const server = new McpServer({ name: 'clinic-hours', version: '1.0.0' });

server.registerTool(
  'get_opening_hours',
  {
    description: 'Opening hours of a hospital department.',
    inputSchema: { department: z.enum(['cardiology', 'radiology', 'pharmacy']) },
  },
  async ({ department }) => {
    const hours = { cardiology: 'Sun-Thu 08:00-16:00', radiology: 'every day 07:00-22:00', pharmacy: '24 hours' };
    return { content: [{ type: 'text', text: `${department}: ${hours[department]}` }] };
  },
);

// ---------------------------------------------------------------------------
// 2. A TRANSPORT: how the bytes travel. Here an in-memory pipe; later stdio (post 05) and HTTP (post 07).
// ---------------------------------------------------------------------------
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();

// Spy on the pipe: print every message the client sends and the server sends back.
const send = clientSide.send.bind(clientSide);
clientSide.send = async (message, options) => {
  console.log('client → server', JSON.stringify(message));
  return send(message, options);
};
const reply = serverSide.send.bind(serverSide);
serverSide.send = async (message, options) => {
  console.log('server → client', JSON.stringify(message).slice(0, 240));
  return reply(message, options);
};

// ---------------------------------------------------------------------------
// 3. The CLIENT: lives inside the host app (an IDE, a chat app, your agent)
// ---------------------------------------------------------------------------
const client = new Client({ name: 'my-first-client', version: '1.0.0' });

section('1. Connect: the handshake (initialize)');
await server.connect(serverSide);
await client.connect(clientSide); // sends "initialize", then "notifications/initialized"
console.log('server says it is:', client.getServerVersion());

section('2. Discover: what tools do you have?');
const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name));

section('3. Call a tool');
const result = await client.callTool({ name: 'get_opening_hours', arguments: { department: 'radiology' } });
console.log('result text:', (result.content as { type: string; text: string }[])[0]?.text);

await client.close();
