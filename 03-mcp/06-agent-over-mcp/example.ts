/**
 * Post 06 — An agent that uses MCP tools   (read the blog post first: 06-agent-over-mcp/README.md)
 *
 * Key ideas:
 *  - The agent doesn't hard-code tools: it DISCOVERS them from the server at runtime.
 *  - The HOST decides what the model may use. Here we read tool annotations and hide
 *    destructive tools from the model entirely (least privilege). Annotations come from
 *    the server, so only trust them for servers you trust.
 *
 * Run: npx tsx 06-agent-over-mcp/example.ts "Book Fatima the earliest free cardiology slot for chest pain follow-up"
 *      npx tsx 06-agent-over-mcp/example.ts --offline   (discovery + filtering only, no model)
 */
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateText, stepCountIs } from 'ai';
import { chatModel, modelLabel, section, stripThinking } from '@learn/shared';
import { serverProcess } from '../05-stdio-server/spawn.ts';

const offline = process.argv.includes('--offline');
const task =
  process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'Book Fatima the earliest free cardiology slot for a chest pain follow-up.';

// 1. Connect the AI SDK's MCP client to the server from post 05 (spawned over stdio).
const mcp = await createMCPClient({ transport: new StdioClientTransport(serverProcess) });
try {
  // 2. Discover the tools, then FILTER them: the model never even sees destructive ones.
  const definitions = await mcp.listTools();
  const allowed = { ...definitions, tools: definitions.tools.filter((t) => !t.annotations?.destructiveHint) };
  console.log('tools on the server     :', definitions.tools.map((t) => t.name).join(', '));
  console.log('tools offered to model  :', allowed.tools.map((t) => t.name).join(', '));

  // 3. Turn MCP tool definitions into AI SDK tools. Each one's execute() is a tools/call to the server.
  const tools = mcp.toolsFromDefinitions(allowed);

  if (!offline) {
    section(`Agent run (${modelLabel()})`);
    const result = await generateText({
      model: chatModel(),
      instructions:
        'You are a scheduling assistant. Always look up ids with tools (find_patient, search_slots) ' +
        'before booking. Never invent ids. Reply with a one-line confirmation.',
      prompt: task,
      tools,
      stopWhen: stepCountIs(6), // the step limit, as in lesson 01
    });

    for (const [i, step] of result.steps.entries()) {
      for (const c of step.toolCalls) console.log(`step ${i}: ${c.toolName}(${JSON.stringify(c.input)})`);
      for (const r of step.toolResults) console.log(`        → ${JSON.stringify(r.output).slice(0, 160)}`);
    }
    console.log('\nAnswer:', stripThinking(result.text) || `(empty reply, finishReason=${result.finishReason})`);
  }
} finally {
  await mcp.close(); // also terminates the server child process
}
