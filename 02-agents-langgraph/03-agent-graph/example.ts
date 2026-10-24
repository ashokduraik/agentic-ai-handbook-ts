/**
 * Post 03 — An LLM agent as a graph (agent ⇄ tools)   (read the blog post first: 03-agent-graph/README.md)
 *
 * The hand-written loop from post 01, rebuilt as a LangGraph graph:
 *
 *   START → agent ─(tool calls?)── yes ─→ tools ─→ agent   (loop)
 *                                 └ no ──→ END
 *
 * Two nodes, one conditional edge. The model lives in the `agent` node; your code lives in `tools`.
 *
 * Run:  npx tsx 03-agent-graph/example.ts            (CHAT_MODEL from .env, through Ollama)
 *       npx tsx 03-agent-graph/example.ts --offline  (a scripted "model", no LLM)
 */
import { StateGraph, StateSchema, MessagesValue, START, END, type GraphNode } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { env, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// The tool (LangChain style: function + name/description/schema)
// ---------------------------------------------------------------------------
const appointments = [
  { id: 'A-100', patientId: 'P-001', dept: 'cardiology', when: '2026-11-03 09:30' },
  { id: 'A-101', patientId: 'P-001', dept: 'radiology', when: '2026-11-05 14:00' },
];
const listAppointments = tool(
  async ({ patientId }) => JSON.stringify(appointments.filter((a) => a.patientId === patientId)),
  {
    name: 'list_appointments',
    description: 'List all appointments for a patient id like P-001. Read-only.',
    schema: z.object({ patientId: z.string() }),
  },
);

// ---------------------------------------------------------------------------
// STATE: just the conversation. MessagesValue APPENDS new messages (a built-in reducer).
// ---------------------------------------------------------------------------
const AgentState = new StateSchema({ messages: MessagesValue });

// ---------------------------------------------------------------------------
// The model: real (Ollama, model name from .env) or scripted (for --offline)
// ---------------------------------------------------------------------------
type CallModel = (messages: BaseMessage[]) => Promise<AIMessage>;

function realModel(): CallModel {
  const llm = new ChatOllama({ model: env.chatModel, baseUrl: env.ollamaBaseUrl, temperature: 0, numPredict: 1024 });
  const withTools = llm.bindTools([listAppointments]); // tell the model which tools exist
  return (messages) => withTools.invoke(messages);
}

// Scripted model: first asks for the tool, then answers. Lets you test the GRAPH without an LLM.
function scriptedModel(): CallModel {
  return async (messages) => {
    const lastMessage = messages.at(-1);
    if (!ToolMessage.isInstance(lastMessage)) {
      return new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'list_appointments', args: { patientId: 'P-001' } }] });
    }
    return new AIMessage('P-001 has radiology on 2026-11-05 at 14:00.');
  };
}
const callModel = process.argv.includes('--offline') ? scriptedModel() : realModel();

// ---------------------------------------------------------------------------
// NODES
// ---------------------------------------------------------------------------
const agent: GraphNode<typeof AgentState> = async (state) => {
  const reply = await callModel([
    new SystemMessage('You help hospital front-desk staff. Use the tools to look things up. Never invent appointments.'),
    ...state.messages,
  ]);
  return { messages: [reply] }; // appended, thanks to MessagesValue
};

const tools: GraphNode<typeof AgentState> = async (state) => {
  const last = state.messages.at(-1) as AIMessage;
  const results: ToolMessage[] = [];
  for (const call of last.tool_calls ?? []) {
    const output = await listAppointments.invoke(call.args as { patientId: string }); // args checked by the tool's schema
    results.push(new ToolMessage({ tool_call_id: call.id!, name: call.name, content: String(output) }));
  }
  return { messages: results };
};

// ---------------------------------------------------------------------------
// EDGES: the loop
// ---------------------------------------------------------------------------
const graph = new StateGraph(AgentState)
  .addNode('agent', agent)
  .addNode('tools', tools)
  .addEdge(START, 'agent')
  .addConditionalEdges(
    'agent',
    (state) => {
      const last = state.messages.at(-1);
      return last && AIMessage.isInstance(last) && last.tool_calls?.length ? 'tools' : END;
    },
    ['tools', END],
  )
  .addEdge('tools', 'agent') // after the tools, the model looks again
  .compile();

// ---------------------------------------------------------------------------
// RUN with streamMode "updates": one event per finished node — great for logs and UIs
// ---------------------------------------------------------------------------
section('Node-by-node updates');
const stream = await graph.stream(
  { messages: [new HumanMessage('When is patient P-001 seeing radiology?')] },
  { streamMode: 'updates' },
);
for await (const update of stream) {
  for (const [node, delta] of Object.entries(update)) {
    for (const m of (delta as { messages?: BaseMessage[] }).messages ?? []) {
      const calls = AIMessage.isInstance(m) && m.tool_calls?.length ? ` → asks for ${JSON.stringify(m.tool_calls.map((c) => [c.name, c.args]))}` : '';
      console.log(`[${node}] ${m.getType()}: ${stripThinking(String(m.content)).slice(0, 200)}${calls}`);
    }
  }
}
