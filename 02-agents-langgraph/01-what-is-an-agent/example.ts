/**
 * Post 01 — What is an agent?   (read the blog post first: 01-what-is-an-agent/README.md)
 *
 * An agent is a LOOP: the model looks at the conversation, decides the next action
 * (call a tool, or give the final answer), YOUR code runs the action, the result goes
 * back into the conversation, and the model decides again.
 *
 * Here we write that loop BY HAND with the AI SDK, so you can see every moving part
 * before LangGraph (posts 02–08) gives it a proper structure.
 *
 * Run:  npx tsx 01-what-is-an-agent/example.ts
 */
import { generateText, tool, type JSONValue, type ModelMessage } from 'ai';
import { z } from 'zod';
import { chatModel, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// The "world" the agent can look at: a tiny appointment book
// ---------------------------------------------------------------------------
const appointments = [
  { id: 'A-100', patientId: 'P-001', dept: 'cardiology', when: '2026-11-03 09:30' },
  { id: 'A-101', patientId: 'P-001', dept: 'radiology', when: '2026-11-05 14:00' },
];

// ---------------------------------------------------------------------------
// The tool: described to the model, but WITHOUT `execute`
// ---------------------------------------------------------------------------
// With no `execute`, the AI SDK stops after the model ASKS for the tool and hands the
// request to us. We run it ourselves below, so the loop is visible.
const tools = {
  list_appointments: tool({
    description: 'List all appointments for a patient id like P-001.',
    inputSchema: z.object({ patientId: z.string() }),
  }),
};

// Our code, not the model, actually does the work.
function runTool(name: string, input: unknown): JSONValue {
  if (name === 'list_appointments') {
    const { patientId } = input as { patientId: string };
    return appointments.filter((a) => a.patientId === patientId);
  }
  return { error: `Unknown tool ${name}` };
}

// ---------------------------------------------------------------------------
// The agent loop: decide → act → observe → decide again, at most MAX_STEPS times
// ---------------------------------------------------------------------------
const MAX_STEPS = 5; // the safety limit every agent needs
const messages: ModelMessage[] = [{ role: 'user', content: 'When is patient P-001 seeing radiology?' }];

for (let step = 1; step <= MAX_STEPS; step++) {
  section(`Step ${step}: the model decides`);
  const result = await generateText({
    model: chatModel(),
    instructions: 'You help hospital front-desk staff. Use the tools to look things up. Never invent appointments.',
    tools,
    messages, // the WHOLE conversation so far: this is the agent's memory
    temperature: 0,
  });
  console.log('finishReason =', result.finishReason); // "tool-calls" or "stop"
  messages.push(...result.response.messages); // remember what the model said (text and/or tool calls)

  // DECISION 1: no tool calls → the model is done.
  if (result.toolCalls.length === 0) {
    console.log('Final answer:', stripThinking(result.text) || '(empty: the model gave no visible text)');
    break;
  }

  // DECISION 2: tool calls → we ACT, then put each result back as an OBSERVATION.
  for (const call of result.toolCalls) {
    const output = runTool(call.toolName, call.input);
    console.log(`model asked: ${call.toolName}(${JSON.stringify(call.input)})`);
    console.log(`we returned: ${JSON.stringify(output)}`);
    messages.push({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: { type: 'json', value: output } }],
    });
  }
  if (step === MAX_STEPS) console.log(`Stopped after ${MAX_STEPS} steps without a final answer.`);
}
