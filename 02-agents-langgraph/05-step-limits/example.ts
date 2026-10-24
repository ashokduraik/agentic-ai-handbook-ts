/**
 * Post 05 — Step limits: stopping a runaway agent   (read the blog post first: 05-step-limits/README.md)
 *
 * A confused model can call the same tool forever. LangGraph counts every node run as a
 * "super-step" and stops the run when it passes `recursionLimit`, throwing GraphRecursionError.
 * You set the limit on EVERY invoke and decide what the user sees when it trips.
 *
 *   START → agent ⇄ tools   (the scripted "model" below never stops asking)
 *
 * Run:  npx tsx 05-step-limits/example.ts      (no model needed: a deliberately stuck fake model)
 */
import { StateGraph, StateSchema, MessagesValue, GraphRecursionError, START, END, type GraphNode } from '@langchain/langgraph';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { section } from '@learn/shared';

const AgentState = new StateSchema({ messages: MessagesValue });

// A STUCK model: it asks for the same lookup again and again and never answers.
let modelCalls = 0;
const agent: GraphNode<typeof AgentState> = async () => {
  modelCalls++;
  console.log(`  agent step ${modelCalls}: asks for search_slots(cardiology) again`);
  return {
    messages: [new AIMessage({ content: '', tool_calls: [{ id: `c${modelCalls}`, name: 'search_slots', args: { dept: 'cardiology' } }] })],
  };
};

const tools: GraphNode<typeof AgentState> = async (state) => {
  const call = (state.messages.at(-1) as AIMessage).tool_calls![0]!;
  return { messages: [new ToolMessage({ tool_call_id: call.id!, content: 'No free slots this week.' })] };
};

const graph = new StateGraph(AgentState)
  .addNode('agent', agent)
  .addNode('tools', tools)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (s) => ((s.messages.at(-1) as AIMessage).tool_calls?.length ? 'tools' : END), ['tools', END])
  .addEdge('tools', 'agent')
  .compile();

section('Run with recursionLimit: 6');
try {
  await graph.invoke(
    { messages: [new HumanMessage('Find me a cardiology slot this week.')] },
    { recursionLimit: 6 }, // at most 6 node runs (agent + tools each count), then stop
  );
} catch (e) {
  if (e instanceof GraphRecursionError) {
    // Turn the crash into a safe, honest reply (and log it: a loop is a bug worth looking at).
    console.log(`\n⛔ Stopped after ${modelCalls} model calls: ${e.name}`);
    console.log('Reply to user: "Sorry, I could not finish this request. A staff member will follow up."');
  } else {
    throw e;
  }
}
