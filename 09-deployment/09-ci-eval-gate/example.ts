/**
 * Post 09 — CI with an eval gate: a prompt change that makes answers worse fails the build
 * (read the blog post first: 09-ci-eval-gate/README.md)
 *
 * A miniature of what CI's `evals` job does with lesson 05's suite:
 *   A. a few cases, each with a fact the answer must contain
 *   B. run them through the service's ask() (fake offline, the real RAG pipeline live)
 *   C. score = share of cases passed; exit code 1 below EVAL_THRESHOLD → CI marks the build red
 *
 * Run:  npx tsx 09-ci-eval-gate/example.ts                         (the real pipeline)
 *       npx tsx 09-ci-eval-gate/example.ts --offline               (a fake that gets 2 of 3 right)
 *       EVAL_THRESHOLD=0.9 npx tsx 09-ci-eval-gate/example.ts --offline   (watch the gate fail)
 */
import { optional, section } from '@learn/shared';
import type { AskResult } from '../06-the-rag-service/app.ts';
import { realDeps } from '../06-the-rag-service/server.ts';

const offline = process.argv.includes('--offline');

// 1. Cases: a question and what a correct answer must contain (or must admit not knowing).
const cases = [
  { question: 'How much is the deposit after three no-shows?', mustContain: /100/ },
  { question: 'How long does a refill approval take?', mustContain: /2 working days|two working days/i },
  { question: 'Do you offer dental implants?', unanswerable: true },
];

const fakeAsk = async (q: string): Promise<AskResult> => ({
  answer: q.includes('deposit') ? 'A SAR 100 deposit [1].' : q.includes('refill') ? 'Within a week [1].' : 'I do not know.',
  citations: [1],
  answerable: !q.includes('dental'),
  citationsValid: true,
});
const ask = offline ? fakeAsk : (await realDeps()).ask;

// 2. Run every case and grade it with a deterministic check (lesson 05 adds LLM judges on top).
section('[A+B] Cases');
let passed = 0;
for (const c of cases) {
  const r = await ask(c.question, AbortSignal.timeout(60_000));
  const ok = c.unanswerable ? !r.answerable : r.answerable && r.citationsValid && c.mustContain!.test(r.answer);
  if (ok) passed++;
  console.log(`  ${ok ? '✅' : '❌'} ${c.question}\n     → ${JSON.stringify(r.answer.slice(0, 120))}`);
}

// 3. The gate. In CI a non-zero exit code fails the job, and the pull request shows a red ❌.
const score = passed / cases.length;
const threshold = Number(optional('EVAL_THRESHOLD', '0.6'));
section('[C] Gate');
console.log(`  score ${score.toFixed(2)}  threshold ${threshold}  → ${score >= threshold ? 'PASS ✅' : 'FAIL ❌ (exit code 1)'}`);
process.exit(score >= threshold ? 0 : 1);
