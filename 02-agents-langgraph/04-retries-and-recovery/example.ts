/**
 * Post 04 — Retries and failure recovery   (read the blog post first: 04-retries-and-recovery/README.md)
 *
 * Two kinds of failure, two tools:
 *   A. A TEMPORARY failure (a timeout that goes away)  → retryPolicy on the node: try again with backoff.
 *   B. A LASTING failure (the lab system is down)      → retries run out, so we CATCH the error and
 *      route to a fallback node that still gives the user something useful.
 *
 *   START → fetch_labs ─(ok)────→ summarise ─→ END
 *                      └(failed)→ fallback ──→ END
 *
 * Run:  npx tsx 04-retries-and-recovery/example.ts      (no model needed)
 */
import { StateGraph, StateSchema, START, END, type GraphNode } from '@langchain/langgraph';
import { z } from 'zod';
import { section } from '@learn/shared';

// ---------------------------------------------------------------------------
// A fake lab API that fails the first `failTimes` calls
// ---------------------------------------------------------------------------
let calls = 0;
let failTimes = 0;
async function labApi(patientId: string) {
  calls++;
  if (calls <= failTimes) {
    console.log(`  ↳ lab API call #${calls}: timeout`);
    throw new Error('Lab API timeout');
  }
  console.log(`  ↳ lab API call #${calls}: ok`);
  return { patientId, hba1c: '7.9 %', ldl: '3.1 mmol/L' };
}

const LabState = new StateSchema({
  patientId: z.string(),
  labs: z.record(z.string(), z.string()).optional(),
  error: z.string().optional(),
  reply: z.string().default(''),
});

// ---------------------------------------------------------------------------
// The node that talks to the flaky API
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 3;
let attempt = 0;
const fetchLabs: GraphNode<typeof LabState> = async (state) => {
  attempt++;
  try {
    return { labs: await labApi(state.patientId) };
  } catch (e) {
    // Not the last attempt yet → re-throw, so the retryPolicy runs this node again.
    if (attempt < MAX_ATTEMPTS) throw e;
    // Last attempt also failed → stop retrying and RECORD the failure in state instead.
    return { error: (e as Error).message };
  }
};

const summarise: GraphNode<typeof LabState> = async (state) => ({
  reply: `Latest labs for ${state.patientId}: ${JSON.stringify(state.labs)}`,
});

// The fallback still helps: it says what happened and what to do next. It never invents lab values.
const fallback: GraphNode<typeof LabState> = async (state) => ({
  reply: `Lab results are unavailable right now (${state.error}). A ticket was raised; please check the lab portal.`,
});

const graph = new StateGraph(LabState)
  .addNode('fetch_labs', fetchLabs, {
    // Retry with exponential backoff: wait 100 ms, then 200 ms, ... up to maxAttempts runs in total.
    retryPolicy: { maxAttempts: MAX_ATTEMPTS, initialInterval: 100, backoffFactor: 2, logWarning: false },
  })
  .addNode('summarise', summarise)
  .addNode('fallback', fallback)
  .addEdge(START, 'fetch_labs')
  .addConditionalEdges('fetch_labs', (state) => (state.error ? 'fallback' : 'summarise'), ['summarise', 'fallback'])
  .addEdge('summarise', END)
  .addEdge('fallback', END)
  .compile();

// ---------------------------------------------------------------------------
// A. Temporary failure: fails twice, the third attempt works
// ---------------------------------------------------------------------------
section('A. API fails twice, then recovers → retryPolicy saves the day');
calls = 0; attempt = 0; failTimes = 2;
const recovered = await graph.invoke({ patientId: 'P-001' });
console.log(recovered.reply);
// The final state has the same shape as in post 02 (every field of the schema), so we do not dump
// it again: we print only the two fields that decide recovery vs. fallback.
// Notice: `labs` is filled and there is no `error`, so the router chose `summarise`.
// The two failed attempts left no trace in state: a retry simply runs the node again.
console.log('labs in state: ', recovered.labs);
console.log('error in state:', recovered.error);

// ---------------------------------------------------------------------------
// B. Lasting failure: every attempt fails → fallback path
// ---------------------------------------------------------------------------
section('B. API is down → retries run out → fallback node');
calls = 0; attempt = 0; failTimes = 99;
const failed = await graph.invoke({ patientId: 'P-001' });
console.log(failed.reply);
// Same two fields. Notice: no `labs`, but an `error`: the node RECORDED the failure in state,
// which is what let the conditional edge route to `fallback` instead of crashing the run.
console.log('labs in state: ', failed.labs);
console.log('error in state:', failed.error);
