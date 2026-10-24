/**
 * Post 04 — Prompts: reusable templates   (read the blog post first: 04-prompts/README.md)
 *
 * The third MCP primitive. A prompt is a named, parameterised message template that the
 * USER picks (think "slash command" in an IDE or chat app). The server owns the wording;
 * the client fills in the arguments and sends the result to its model.
 *
 * Run: npx tsx 04-prompts/example.ts            (part 2 calls CHAT_MODEL)
 *      npx tsx 04-prompts/example.ts --offline  (part 1 only)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generateText, type ModelMessage } from 'ai';
import { z } from 'zod';
import { chatModel, modelLabel, section, stripThinking } from '@learn/shared';

const server = new McpServer({ name: 'clinic-prompts', version: '1.0.0' });

server.registerPrompt(
  'confirmation-sms',
  {
    title: 'Appointment confirmation SMS',
    description: 'Draft a short, friendly SMS confirming an appointment',
    argsSchema: { patientName: z.string(), when: z.string(), doctor: z.string() }, // the "form" a UI shows
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

const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await server.connect(serverSide);
const client = new Client({ name: 'prompts-demo', version: '1.0.0' });
await client.connect(clientSide);

section('1. Discover and fill a prompt (no model)');
const { prompts } = await client.listPrompts();
for (const p of prompts) console.log(`prompt ${p.name}: ${p.description}  args=${p.arguments?.map((a) => a.name).join(', ')}`);

const filled = await client.getPrompt({
  name: 'confirmation-sms',
  arguments: { patientName: 'Fatima', when: '3 Nov 09:30', doctor: 'Dr. Qureshi' },
});
console.log(JSON.stringify(filled.messages, null, 2));

if (!process.argv.includes('--offline')) {
  section(`2. Send the filled prompt to the model (${modelLabel()})`);
  // MCP prompt messages are { role, content: { type: 'text', text } }; the AI SDK wants { role, content: string }.
  const messages: ModelMessage[] = filled.messages.map((m) => ({
    role: m.role,
    content: m.content.type === 'text' ? m.content.text : '',
  }));
  const { text } = await generateText({ model: chatModel(), messages, maxOutputTokens: 400 });
  const sms = stripThinking(text);
  console.log(`SMS (${sms.length} chars): ${sms}`);
}

await client.close();
