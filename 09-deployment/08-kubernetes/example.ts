/**
 * Post 08 — Kubernetes: what the probes in k8s/deployment.yaml actually do
 * (read the blog post first: 08-kubernetes/README.md)
 *
 * A tiny "kubelet" that polls the post 06 app like Kubernetes would, with the same thresholds as
 * k8s/deployment.yaml (one "second" is 10 ms here, so the demo is quick):
 *
 *   1. the pod starts → the startup probe passes → readiness passes → it receives traffic
 *   2. the model backend goes down → readiness fails 3 times → the pod is REMOVED from the Service,
 *      but liveness still passes → it is NOT restarted (restarting wouldn't fix Ollama)
 *   3. the backend comes back → ready again → traffic returns
 *
 * Run:  npx tsx 08-kubernetes/example.ts   (no model and no cluster needed)
 */
import type { AddressInfo } from 'node:net';
import { section } from '@learn/shared';
import { createApp } from '../06-the-rag-service/app.ts';

// Same numbers as k8s/deployment.yaml; one "second" here is 10 ms.
const SECOND = 10;
const probes = {
  liveness: { path: '/healthz', periodSeconds: 10, failureThreshold: 3 },
  readiness: { path: '/readyz', periodSeconds: 5, failureThreshold: 3 },
};

let backendUp = true; // flip this to simulate Ollama (or the cloud endpoint) going away
const app = createApp({
  maxConcurrent: 4,
  timeoutMs: 1000,
  ready: async () => (backendUp ? { ready: true, reason: 'ok' } : { ready: false, reason: 'ollama unreachable' }),
  ask: async () => ({ answer: 'ok [1]', citations: [1], answerable: true, citationsValid: true }),
});
await new Promise<void>((r) => app.listen(0, r));
const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;

// 1. The kubelet's view: count consecutive failures per probe; act at the threshold.
const state = { inService: false, restarts: 0, fails: { liveness: 0, readiness: 0 } };
const t0 = performance.now();
const log = (msg: string) => console.log(`  t=${String(Math.round((performance.now() - t0) / SECOND)).padStart(3)}s  ${msg}`);

async function probe(name: keyof typeof probes) {
  const ok = await fetch(base + probes[name].path).then((r) => r.ok, () => false);
  state.fails[name] = ok ? 0 : state.fails[name] + 1;
  if (name === 'readiness') {
    // 2. Readiness: out of the Service after N failures, back in after one success. No restart.
    if (ok && !state.inService) (state.inService = true), log('readiness ✅ → added to Service endpoints (gets traffic)');
    if (state.fails.readiness === probes.readiness.failureThreshold && state.inService) (state.inService = false), log('readiness ❌×3 → REMOVED from Service endpoints (no traffic, no restart)');
  } else if (state.fails.liveness === probes.liveness.failureThreshold) {
    // 3. Liveness: N failures means "wedged" → the container is restarted.
    state.restarts++;
    log('liveness ❌×3 → container RESTARTED');
  }
}

const timers = (Object.keys(probes) as (keyof typeof probes)[]).map((name) => setInterval(() => probe(name), probes[name].periodSeconds * SECOND));
const wait = (seconds: number) => new Promise((r) => setTimeout(r, seconds * SECOND));

section('A pod\'s life, as the kubelet sees it');
log('pod started (the startup probe on /healthz passes at once here; real first boots ingest docs first)');
await wait(12);
log('💥 model backend goes down');
backendUp = false;
await wait(25);
log(`liveness failures so far: ${state.fails.liveness}, restarts: ${state.restarts}`);
log('🔧 model backend is back');
backendUp = true;
await wait(10);

timers.forEach(clearInterval);
app.close();
if (state.restarts !== 0 || !state.inService) throw new Error('expected: back in service, never restarted');
