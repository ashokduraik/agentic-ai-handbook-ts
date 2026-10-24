/**
 * Post 08 — Multi-agent handoffs   (read the blog post first: 08-multi-agent-handoffs/README.md)
 *
 * Instead of one agent with every tool and a giant prompt, split the work:
 *   - a SUPERVISOR decides who should handle the request,
 *   - SPECIALIST agents each have a small prompt (and, in real life, their own tools),
 *   - a HANDOFF is `return new Command({ goto: 'other_agent', update: {...} })`:
 *     "move to that node next, and add this to the state".
 *
 *   START → supervisor ──handoff──→ billing_agent  ──(clinical question inside?)──handoff──→ clinical_agent → END
 *                       └─handoff──→ clinical_agent → END
 *
 * Run:  npx tsx 08-multi-agent-handoffs/example.ts            (CHAT_MODEL via Ollama)
 *       npx tsx 08-multi-agent-handoffs/example.ts --offline  (keyword rules + canned replies, no LLM)
 */
import { StateGraph, StateSchema, Command, START, END, ReducedValue, type GraphNode } from '@langchain/langgraph';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { env, section, stripThinking } from '@learn/shared';

// ---------------------------------------------------------------------------
// Shared state: the request, which agents worked on it, and their answers
// ---------------------------------------------------------------------------
const DeskState = new StateSchema({
  request: z.string(),
  handoffs: new ReducedValue(z.array(z.string()).default(() => []), { inputSchema: z.string(), reducer: (a, b) => [...a, b] }),
  answers: new ReducedValue(z.array(z.string()).default(() => []), { inputSchema: z.string(), reducer: (a, b) => [...a, b] }),
});

// ---------------------------------------------------------------------------
// One small helper: ask the model with a role-specific instruction (or use a canned reply offline)
// ---------------------------------------------------------------------------
const offline = process.argv.includes('--offline');
const llm = new ChatOllama({ model: env.chatModel, baseUrl: env.ollamaBaseUrl, temperature: 0, numPredict: 512 });
async function ask(role: string, request: string, cannedReply: string) {
  if (offline) return cannedReply;
  const reply = await llm.invoke([
    ['system', role],
    ['human', request],
  ]);
  return stripThinking(String(reply.content));
}

// ---------------------------------------------------------------------------
// The SUPERVISOR: routes only, never answers
// ---------------------------------------------------------------------------
const supervisor: GraphNode<typeof DeskState> = async (state) => {
  const word = await ask(
    'You route hospital front-desk requests. Reply with exactly one word: billing (invoices, payments, insurance) or clinical (symptoms, medicines, results).',
    state.request,
    /invoice|bill|pay|insurance/i.test(state.request) ? 'billing' : 'clinical',
  );
  const target = /billing/i.test(word) ? 'billing_agent' : 'clinical_agent'; // never trust free text: map it to a known node
  return new Command({ goto: target, update: { handoffs: `supervisor → ${target}` } });
};

// ---------------------------------------------------------------------------
// SPECIALISTS: small prompts, one job each. Billing can hand off to clinical.
// ---------------------------------------------------------------------------
const billingAgent: GraphNode<typeof DeskState> = async (state) => {
  const answer = await ask(
    'You are the billing desk of a hospital. Answer ONLY the billing part in two sentences. Never give medical advice.',
    state.request,
    'Your invoice INV-2207 is ready in the patient portal under Billing → Invoices.',
  );
  // A HANDOFF between specialists: the request also has a clinical part billing must not answer.
  const needsClinical = /dose|tablet|medicine|pain|symptom/i.test(state.request);
  return new Command({
    goto: needsClinical ? 'clinical_agent' : END,
    update: { answers: `[billing] ${answer}`, handoffs: needsClinical ? 'billing_agent → clinical_agent' : 'billing_agent → END' },
  });
};

const clinicalAgent: GraphNode<typeof DeskState> = async (state) => {
  const answer = await ask(
    'You are a clinical nurse line. Answer ONLY the medical part in two sentences, and tell the patient to confirm with their doctor.',
    state.request,
    'Do not double the dose. Take the next tablet at the usual time and confirm with your doctor.',
  );
  return { answers: `[clinical] ${answer}`, handoffs: 'clinical_agent → END' };
};

// ---------------------------------------------------------------------------
// The graph: with Command, the NODE picks the next step, so we declare where it MAY go (`ends`)
// ---------------------------------------------------------------------------
const graph = new StateGraph(DeskState)
  .addNode('supervisor', supervisor, { ends: ['billing_agent', 'clinical_agent'] })
  .addNode('billing_agent', billingAgent, { ends: ['clinical_agent', END] })
  .addNode('clinical_agent', clinicalAgent)
  .addEdge(START, 'supervisor')
  .addEdge('clinical_agent', END)
  .compile();

for (const request of [
  'Where can I download my invoice from last week?',
  'I need my invoice, and also: I missed my blood pressure tablet this morning, should I take two now?',
]) {
  section(request);
  const final = await graph.invoke({ request }, { recursionLimit: 10 });
  console.log('route  :', final.handoffs.join('  |  '));
  final.answers.forEach((a) => console.log(a));
}
