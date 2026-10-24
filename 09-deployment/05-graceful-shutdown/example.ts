/**
 * Post 05 — Graceful shutdown: finish the answers you started
 * (read the blog post first: 05-graceful-shutdown/README.md)
 *
 *   A. installGracefulShutdown(): on SIGTERM, flip readiness off, stop accepting, drain, exit.
 *   B. Demo: a 1-second request is in flight when SIGTERM arrives. It still gets its answer;
 *      a request that arrives after SIGTERM is refused; then the process exits 0.
 *
 * Post 06's server imports installGracefulShutdown from this file.
 *
 * Run:  npx tsx 05-graceful-shutdown/example.ts   (no model needed; sends SIGTERM to itself)
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isMain, section } from '@learn/shared';

export function installGracefulShutdown(server: Server, { onDraining = () => {}, hardStopMs = 25_000 } = {}) {
  const shutdown = (signal: string) => {
    // 1. Tell the load balancer first: /readyz now answers 503, so no NEW traffic is sent here.
    onDraining();
    console.log(JSON.stringify({ level: 'info', msg: `${signal}: draining` }));
    // 2. Stop accepting connections. The callback runs once every in-flight request has finished.
    server.close(() => {
      console.log(JSON.stringify({ level: 'info', msg: 'drained, exiting' }));
      process.exit(0);
    });
    server.closeIdleConnections(); // keep-alive connections with nothing in flight can go now
    // 3. A hard stop, just under Kubernetes' terminationGracePeriodSeconds (30 s by default).
    setTimeout(() => process.exit(1), hardStopMs).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

// ---- the demo (skipped when another file imports from here) -----------------------------------
if (isMain(import.meta.url)) {
  let draining = false;
  const server = createServer(async (req, res) => {
    if (req.url === '/readyz') return res.writeHead(draining ? 503 : 200).end();
    await new Promise((r) => setTimeout(r, 1000)); // a slow "model call"
    res.writeHead(200).end('here is your answer');
  });
  installGracefulShutdown(server, { onDraining: () => (draining = true), hardStopMs: 5000 });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const t0 = performance.now();
  const at = () => `${String(Math.round(performance.now() - t0)).padStart(5)} ms`;

  section('[B] SIGTERM while a request is in flight');
  const inFlight = fetch(`${base}/ask`, { method: 'POST' }).then(async (r) => console.log(`${at()}  in-flight request → ${r.status} "${await r.text()}"`));
  await new Promise((r) => setTimeout(r, 200));
  console.log(`${at()}  sending SIGTERM (what Kubernetes does on a rolling update)`);
  process.kill(process.pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 50));
  await fetch(`${base}/ask`, { method: 'POST' }).then(
    (r) => console.log(`${at()}  new request → ${r.status}`),
    (e) => console.log(`${at()}  new request → refused (${(e as Error).cause ? ((e as Error).cause as Error).message : (e as Error).message})`),
  );
  await inFlight;
}
