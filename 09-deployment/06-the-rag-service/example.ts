/**
 * Post 06 — The RAG service: posts 01–05 around the lesson 04 pipeline
 * (read the blog post first: 06-the-rag-service/README.md)
 *
 *   --offline: a smoke test of the HTTP layer with a FAKE pipeline (this runs in CI):
 *              healthz, readyz, validation 400, load-shedding 429, timeout 504, a real answer 200.
 *   live:      the REAL pipeline (ingests 04-rag/docs on first run), one question over HTTP.
 *
 * Run:  npx tsx 06-the-rag-service/example.ts            (EMBED_MODEL + CHAT_MODEL)
 *       npx tsx 06-the-rag-service/example.ts --offline
 *       npm start                                        (the real server on :8080)
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { section } from '@learn/shared';
import { createApp, type Deps } from './app.ts';
import { realDeps } from './server.ts';

const offline = process.argv.includes('--offline');

// 1. The fake pipeline: answers in 100 ms, or 1 s when the question says "slow". It honours abortSignal.
const fakeDeps: Deps = {
  maxConcurrent: 1,
  timeoutMs: 300,
  ready: async () => ({ ready: true, reason: 'fake' }),
  ask: (question, abortSignal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ answer: `echo: ${question} [1]`, citations: [1], answerable: true, citationsValid: true }), question.includes('slow') ? 1000 : 100);
      abortSignal.addEventListener('abort', () => (clearTimeout(timer), reject(abortSignal.reason)));
    }),
};

const app = createApp(offline ? fakeDeps : await realDeps());
await new Promise<void>((r) => app.listen(0, r));
const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
const ask = (question: unknown) => fetch(`${base}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });

if (offline) {
  section('Smoke test (fake pipeline)');
  // 2. Each check is one behaviour from posts 01–05.
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
  assert.equal((await ask('hi')).status, 400, 'too short → 400');
  const ok = await ask('How much is the deposit?');
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { answer: string }).answer, 'echo: How much is the deposit? [1]');
  const [a, b] = await Promise.all([ask('first question'), ask('second question')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429], 'second concurrent request is shed');
  assert.equal((await ask('a slow question')).status, 504, 'timeout → 504');
  app.startDraining();
  assert.equal((await fetch(`${base}/readyz`)).status, 503, 'draining → not ready');
  console.log('✅ smoke test passed: healthz, readyz, validation 400, answer 200, load-shedding 429, timeout 504, draining 503');
} else {
  section('One question through the real service');
  console.log('readyz:', await (await fetch(`${base}/readyz`)).json());
  const r = await ask('How much is the no-show deposit?');
  console.log(r.status, await r.json());
}
app.close();
process.exit(0);
