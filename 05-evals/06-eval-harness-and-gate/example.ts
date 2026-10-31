/**
 * Post 06 — The eval harness and the CI gate   (read the blog post first: 06-eval-harness-and-gate/README.md)
 *
 * Runs EVERY golden case (post 02) through the real RAG app (lesson 04: retrieve → answer) and scores it
 * in layers, cheapest first:
 *   1. code checks (post 03): hit@3, refusal, mustContain, mustContainAll, citations
 *   2. judges, unless --no-judge: our faithfulness judge (post 04), autoevals Faithfulness + Factuality (post 05)
 * Then: a table, output/eval-report.json, and a GATE: exit code 1 when the overall score < EVAL_THRESHOLD,
 * or when judges were on and EVERY judge call failed (a dead judge is not a pass).
 *
 * Run: npx tsx 06-eval-harness-and-gate/example.ts             (npm run evals)
 *      npx tsx 06-eval-harness-and-gate/example.ts --no-judge  (npm run evals:fast — what CI runs)
 *      npx tsx 06-eval-harness-and-gate/example.ts --offline   (fake embeddings + a fake "perfect" app, no model)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { Factuality, Faithfulness, init } from 'autoevals';
import { DOCS_DIR, HybridStore, answer, chunkMarkdown, ingestDir, retrieve, type Hit } from '@learn/rag';
import { fakeEmbed, fakeModel } from '@learn/rag/offline-fakes';
import { chatModel, dump, env, optional, section, stripThinking } from '@learn/shared';
import { cases } from '../02-golden-dataset/dataset.ts';
import { codeChecks } from '../03-code-checks/checks.ts';
import { faithfulness } from '../04-llm-judge-faithfulness/faithfulness.ts';

const offline = process.argv.includes('--offline');
const useJudge = !offline && !process.argv.includes('--no-judge');
const useAutoevals = useJudge && env.provider === 'ollama'; // autoevals speaks the OpenAI API (post 05)
const THRESHOLD = Number(optional('EVAL_THRESHOLD', '0.6'));

// ── The app under test ────────────────────────────────────────────────────────────
const store = new HybridStore(); // a fresh in-memory index every run → reproducible
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
} else await ingestDir(store);

// Offline stand-in for the chat model: replies with the golden reference (or a refusal) for the question it sees.
const perfectApp = fakeModel((p) => {
  const c = cases.find((x) => p.includes(`Question: ${x.question}`.replace(/"/g, '\\"')));
  return c?.answerable ? { answer: `${c.reference} [1]`, citations: [1], answerable: true } : { answer: 'I do not know.', citations: [], answerable: false };
});

async function runApp(question: string) {
  const top: Hit[] = offline ? store.hybridSearch(question, fakeEmbed(question), 3) : (await retrieve(store, question)).top;
  const a = await answer(question, top, offline ? perfectApp : undefined);
  return { ...a, answer: stripThinking(a.answer), sources: top.map((t) => t.source) };
}

// ── Judges: models too, so they can fail. Count failures; never count a failure as a pass. ──
let judgeCalls = 0;
let judgeFailures = 0;
async function judge(fn: () => Promise<{ score: number | null }> | { score: number | null }) {
  judgeCalls++;
  try {
    const result = await fn();
    // Only the score is kept (the full judge results are in posts 04 and 05); it lands in the report row.
    return result.score;
  } catch {
    judgeFailures++;
    return null;
  }
}
const judgeModel = chatModel(optional('JUDGE_MODEL'));
if (useAutoevals) {
  const client = new OpenAI({ baseURL: `${env.ollamaBaseUrl}/v1`, apiKey: 'ollama' });
  init({ client: client as unknown as NonNullable<Parameters<typeof init>[0]>['client'], defaultModel: optional('JUDGE_MODEL', env.chatModel)! });
}

// ── Run every case ─────────────────────────────────────────────────────────────────
type Row = Record<string, string | number | boolean | null>;
const rows: Row[] = [];
for (const c of cases) {
  const t0 = performance.now();
  const r = await runApp(c.question).catch((e: Error) => ({
    answer: `ERROR: ${e.message.slice(0, 80)}`, answerable: true, citationsValid: false, sources: [] as string[], contexts: [] as Hit[],
  })); // an app crash is a failed case, not a crashed eval run
  const first = rows.length === 0;
  // The full app result for the first case: the answer() fields from lesson 04 plus `sources`, the
  // retrieved files best-first. Every code check below reads only these fields.
  if (first) dump(`runApp() result for "${c.id}"`, r);
  const row: Row = { id: c.id, ...codeChecks(c, r), faithLocal: null, faithful: null, factual: null };
  if (useJudge && c.answerable) {
    const context = r.contexts.map((t) => t.text);
    row.faithLocal = await judge(() => faithfulness(judgeModel, r.answer, context));
    if (useAutoevals) {
      row.faithful = await judge(() => Faithfulness({ input: c.question, output: r.answer, context }));
      if (c.reference)
        row.factual = await judge(() => Factuality({ input: c.question, output: r.answer, expected: c.reference }));
    }
  }
  row.ms = Math.round(performance.now() - t0);
  // One row of the report, for the first case. Notice the nulls: a check that doesn't apply
  // (or a judge that failed) is left out of the averages instead of counting as a pass or a fail.
  if (first) dump(`report row for "${c.id}"`, row);
  rows.push(row);
  console.log(`${c.id.padEnd(24)} ${r.answer.replace(/\s+/g, ' ').slice(0, 90)}`);
}

// ── Aggregate: mean of every non-null metric (true → 1, false → 0), then the mean of those ──
section('Results');
console.table(rows);
const metrics = ['hit3', 'refusalOk', 'contains', 'containsAll', 'citations', 'faithLocal', 'faithful', 'factual'] as const;
const summary = Object.fromEntries(
  metrics.map((m) => {
    const vals = rows.map((r) => r[m]).filter((v) => v !== null && v !== undefined).map(Number);
    return [m, vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : null];
  }),
);
const scored = Object.values(summary).filter((v): v is number => v !== null);
const overall = +(scored.reduce((s, v) => s + v, 0) / scored.length).toFixed(2);
console.log({ ...summary, overall, threshold: THRESHOLD, judgeCalls, judgeFailures });

mkdirSync(new URL('../output', import.meta.url), { recursive: true });
writeFileSync(new URL('../output/eval-report.json', import.meta.url), JSON.stringify({ offline, useJudge, rows, summary, overall }, null, 2));

// ── The gate ─────────────────────────────────────────────────────────────────────────
if (judgeCalls > 0 && judgeFailures === judgeCalls) {
  console.error(`❌ every judge call failed (${judgeFailures}/${judgeCalls}): a dead judge is not a pass`);
  process.exitCode = 1;
} else if (overall < THRESHOLD) {
  console.error(`❌ overall ${overall} < threshold ${THRESHOLD}`);
  process.exitCode = 1;
} else console.log(`✅ eval gate passed (overall ${overall} ≥ ${THRESHOLD})`);
