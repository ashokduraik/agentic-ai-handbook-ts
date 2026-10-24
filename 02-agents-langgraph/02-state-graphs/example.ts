/**
 * Post 02 — State graphs: state, nodes and edges   (read the blog post first: 02-state-graphs/README.md)
 *
 * A LangGraph app is three things:
 *   STATE  — one typed object that travels through the graph (here: a triage ticket)
 *   NODES  — plain async functions that read the state and return a PARTIAL update
 *   EDGES  — which node runs next; a CONDITIONAL edge decides at run time
 *
 * No model here on purpose: the graph is just control flow you own. Posts 03+ put a model in a node.
 *
 *   START → intake → classify ─(urgent)──→ page_on_call ─→ END
 *                             └─(routine)─→ book_clinic ──→ END
 *
 * Run:  npx tsx 02-state-graphs/example.ts      (no model needed)
 */
import { StateGraph, StateSchema, ReducedValue, START, END, type GraphNode } from '@langchain/langgraph';
import { z } from 'zod';
import { section } from '@learn/shared';

// ---------------------------------------------------------------------------
// 1. STATE: the shape of the data that flows through the graph
// ---------------------------------------------------------------------------
const TriageState = new StateSchema({
  note: z.string(), // plain field: a new value REPLACES the old one
  urgency: z.enum(['unknown', 'routine', 'urgent']).default('unknown'),
  // ReducedValue: a REDUCER decides how updates combine. Here: append to the audit trail.
  trail: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),
    reducer: (current, next) => [...current, next],
  }),
});

// ---------------------------------------------------------------------------
// 2. NODES: functions that return only the fields they change
// ---------------------------------------------------------------------------
const intake: GraphNode<typeof TriageState> = async (state) => {
  return { note: state.note.trim(), trail: 'intake: note received' };
};

const classify: GraphNode<typeof TriageState> = async (state) => {
  // A rule, not a model — so you can predict the result. (Post 03 lets a model decide.)
  const urgent = /chest pain|breathless|unconscious|bleeding/i.test(state.note);
  return { urgency: urgent ? 'urgent' : 'routine', trail: `classify: ${urgent ? 'urgent' : 'routine'}` };
};

const pageOnCall: GraphNode<typeof TriageState> = async () => ({ trail: 'page_on_call: on-call doctor paged' });
const bookClinic: GraphNode<typeof TriageState> = async () => ({ trail: 'book_clinic: next free clinic slot offered' });

// ---------------------------------------------------------------------------
// 3. EDGES: wire the nodes together, then compile
// ---------------------------------------------------------------------------
const graph = new StateGraph(TriageState)
  .addNode('intake', intake)
  .addNode('classify', classify)
  .addNode('page_on_call', pageOnCall)
  .addNode('book_clinic', bookClinic)
  .addEdge(START, 'intake') // normal edge: always go here next
  .addEdge('intake', 'classify')
  .addConditionalEdges(
    'classify',
    (state) => (state.urgency === 'urgent' ? 'page_on_call' : 'book_clinic'), // the ROUTER function
    ['page_on_call', 'book_clinic'], // every place it may go (used for checks and drawings)
  )
  .addEdge('page_on_call', END)
  .addEdge('book_clinic', END)
  .compile();

// ---------------------------------------------------------------------------
// 4. RUN: invoke() with the starting state, get the final state back
// ---------------------------------------------------------------------------
for (const note of ['  Severe chest pain since 20 minutes, sweating. ', 'Needs a repeat prescription for knee pain.']) {
  section(`Note: "${note.trim()}"`);
  const final = await graph.invoke({ note });
  console.log('urgency =', final.urgency);
  final.trail.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
}

section('The graph as a Mermaid diagram (paste into any Markdown viewer)');
console.log((await graph.getGraphAsync()).drawMermaid());
