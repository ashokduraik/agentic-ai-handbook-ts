/**
 * Post 07 — Human approval that survives a restart   (read the blog post first: 07-human-approval/README.md)
 *
 *   START → agent ─(no tool calls)──────────────→ END
 *             ├─(only safe tools)─→ tools ─→ agent
 *             └─(risky tool)──────→ approval ─(approved)→ tools ─→ agent
 *                                          └─(rejected)→ agent (told it was rejected)
 *
 * `start`  : the agent wants to cancel an appointment → interrupt() pauses the graph,
 *            the state is saved to SQLite, and THE PROCESS EXITS.
 * `resume` : a NEW process loads the checkpoint by thread_id and continues with the human's decision.
 *
 * Run:  npx tsx 07-human-approval/example.ts start               (CHAT_MODEL via Ollama)
 *       npx tsx 07-human-approval/example.ts resume --approve    (or --reject)
 *       add --offline to both to use a scripted model instead of an LLM
 */
import { mkdirSync, rmSync } from 'node:fs';
import { StateGraph, StateSchema, MessagesValue, Command, START, END, interrupt, type GraphNode } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { dump, env, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// Two tools: one safe (read-only), one risky (changes data)
// ---------------------------------------------------------------------------
const appointments = new Map([
  ['A-100', { id: 'A-100', patientId: 'P-001', dept: 'cardiology', when: '2026-11-03 09:30', status: 'booked' }],
  ['A-101', { id: 'A-101', patientId: 'P-001', dept: 'radiology', when: '2026-11-05 14:00', status: 'booked' }],
]);
const listAppointments = tool(
  async ({ patientId }) => JSON.stringify([...appointments.values()].filter((a) => a.patientId === patientId)),
  { name: 'list_appointments', description: 'List all appointments for a patient id like P-001. Read-only.', schema: z.object({ patientId: z.string() }) },
);
const cancelAppointment = tool(
  async ({ appointmentId }) => {
    const a = appointments.get(appointmentId);
    if (!a) return `No appointment ${appointmentId}`;
    a.status = 'cancelled';
    return `Appointment ${appointmentId} cancelled.`;
  },
  { name: 'cancel_appointment', description: 'Cancel ONE appointment by id like A-100.', schema: z.object({ appointmentId: z.string() }) },
);
const toolsByName = { list_appointments: listAppointments, cancel_appointment: cancelAppointment } as Record<string, { invoke(args: unknown): Promise<unknown> }>;

// POLICY IN CODE, not in the prompt: which tools need a human.
const REQUIRES_APPROVAL = new Set(['cancel_appointment']);

// ---------------------------------------------------------------------------
// The model: real or scripted
// ---------------------------------------------------------------------------
type CallModel = (messages: BaseMessage[]) => Promise<AIMessage>;
function realModel(): CallModel {
  const llm = new ChatOllama({ model: env.chatModel, baseUrl: env.ollamaBaseUrl, temperature: 0, numPredict: 1024 });
  const withTools = llm.bindTools([listAppointments, cancelAppointment]);
  return (messages) => withTools.invoke(messages);
}
function scriptedModel(): CallModel {
  return async (messages) => {
    const toolResults = messages.filter((m) => ToolMessage.isInstance(m)).length;
    if (toolResults === 0) return new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'list_appointments', args: { patientId: 'P-001' } }] });
    if (toolResults === 1) return new AIMessage({ content: '', tool_calls: [{ id: 't2', name: 'cancel_appointment', args: { appointmentId: 'A-101' } }] });
    return new AIMessage(`Done. Last tool said: ${String(messages.at(-1)?.content)}`);
  };
}
const offline = process.argv.includes('--offline');
const callModel = offline ? scriptedModel() : realModel();

// ---------------------------------------------------------------------------
// STATE and NODES
// ---------------------------------------------------------------------------
const AgentState = new StateSchema({ messages: MessagesValue });
const lastToolCalls = (state: { messages: BaseMessage[] }) => {
  const last = state.messages.at(-1);
  return last && AIMessage.isInstance(last) ? (last.tool_calls ?? []) : [];
};

const agent: GraphNode<typeof AgentState> = async (state) => ({
  messages: [
    await callModel([
      new SystemMessage(
        'You help front-desk staff manage hospital appointments. Use tools; never invent ids. ' +
          'To act on an appointment, first call list_appointments to find its id, then call the action tool. ' +
          'Do not ask for confirmation: the system asks a human before any risky action runs. ' +
          'If an action was rejected by a human, say so and do not retry it.',
      ),
      ...state.messages,
    ]),
  ],
});

// The approval gate. The FIRST time, interrupt() pauses the graph and saves the state.
// On resume, this node runs AGAIN from the top and interrupt() RETURNS the human's answer.
// So keep the code before interrupt() free of side effects: it runs twice.
const approval: GraphNode<typeof AgentState> = async (state) => {
  const risky = lastToolCalls(state).filter((c) => REQUIRES_APPROVAL.has(c.name));
  const decision = interrupt({ question: 'Approve these actions?', actions: risky }) as { approved: boolean; reviewer: string };
  if (decision.approved) return {}; // nothing to add; the edge below sends us to `tools`
  // Rejected: answer every pending tool call, so the conversation stays well-formed for the model.
  return {
    messages: lastToolCalls(state).map((c) => new ToolMessage({ tool_call_id: c.id!, content: `REJECTED by ${decision.reviewer}` })),
  };
};

const tools: GraphNode<typeof AgentState> = async (state) => ({
  messages: await Promise.all(
    lastToolCalls(state).map(async (c) => {
      const t = toolsByName[c.name];
      const output = t ? await t.invoke(c.args) : `Unknown tool ${c.name}`;
      return new ToolMessage({ tool_call_id: c.id!, name: c.name, content: String(output) });
    }),
  ),
});

// ---------------------------------------------------------------------------
// EDGES, compiled with a SQLite checkpointer (that is what makes the pause durable)
// ---------------------------------------------------------------------------
const dbPath = new URL('../data/checkpoints.db', import.meta.url).pathname;
mkdirSync(new URL('../data', import.meta.url), { recursive: true });
const [cmd = 'start'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (cmd === 'start') rmSync(dbPath, { force: true }); // fresh demo each time

const graph = new StateGraph(AgentState)
  .addNode('agent', agent)
  .addNode('approval', approval)
  .addNode('tools', tools)
  .addEdge(START, 'agent')
  .addConditionalEdges(
    'agent',
    (state) => {
      const calls = lastToolCalls(state);
      if (calls.length === 0) return END;
      return calls.some((c) => REQUIRES_APPROVAL.has(c.name)) ? 'approval' : 'tools';
    },
    ['tools', 'approval', END],
  )
  .addConditionalEdges('approval', (state) => (ToolMessage.isInstance(state.messages.at(-1)) ? 'agent' : 'tools'), ['agent', 'tools'])
  .addEdge('tools', 'agent')
  .compile({ checkpointer: SqliteSaver.fromConnString(dbPath) });

const config = { configurable: { thread_id: 'ticket-4711' }, recursionLimit: 20 }; // thread id = e.g. your support-ticket id

// ---------------------------------------------------------------------------
// start → run until the graph pauses;  resume → continue with the decision
// ---------------------------------------------------------------------------
if (cmd === 'start') {
  section('start: the agent proposes a risky action');
  const result = await graph.invoke({ messages: [new HumanMessage('Patient P-001 asked to cancel their radiology appointment. Please do it.')] }, config);
  const pending = (result as { __interrupt__?: { value: unknown }[] }).__interrupt__; // set when the graph paused
  // The full value invoke() returned while paused. Notice the extra `__interrupt__` field: a list of
  // { id, value }, where `value` is exactly what the approval node passed to interrupt().
  dump('graph.invoke() result (paused)', result);
  if (pending?.length) {
    console.log('⏸  Paused for approval:', JSON.stringify(pending[0]!.value, null, 2));
    console.log('State saved in data/checkpoints.db. This process now exits. Next: ... resume --approve | --reject');
  } else {
    console.log('Finished without needing approval:', stripThinking(String(result.messages.at(-1)?.content)));
  }
} else {
  section('resume: a NEW process continues from the checkpoint');
  const snapshot = await graph.getState(config);
  console.log('Waiting at node(s):', snapshot.next);
  // The snapshot this NEW process loaded from SQLite. Notice: `next` is ['approval'], and `tasks`
  // lists the paused task with its `interrupts` — the same question the start run printed.
  dump('graph.getState() snapshot', snapshot);
  if (snapshot.next.length === 0) {
    console.log('Nothing is waiting for approval on this thread. Run `start` first.');
    process.exit(0);
  }
  const approved = process.argv.includes('--approve');
  const result = await graph.invoke(new Command({ resume: { approved, reviewer: 'dr.ashok' } }), config);
  console.log(approved ? '✅ approved' : '⛔ rejected', '→ final:', stripThinking(String(result.messages.at(-1)?.content)));
  // We do not dump the whole final state again: the paused invoke() above showed that shape, and the
  // line above already prints the final reply. We only print the last ToolMessage: it has the same
  // `tool_call_id` as the cancel call, and says what the tool did on approve or "REJECTED by dr.ashok" on reject.
  const toolMessages = result.messages.filter((m: BaseMessage) => ToolMessage.isInstance(m));
  console.log('last tool message:', String(toolMessages.at(-1)?.content));
}
