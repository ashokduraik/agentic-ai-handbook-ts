/**
 * Post 03 — Load shedding: say "busy, retry later" instead of queueing forever
 * (read the blog post first: 03-load-shedding/README.md)
 *
 *   A. createLimiter(): a counter of requests in flight, with a maximum.
 *   B. A server that answers 429 + retry-after when it's full.
 *   C. Six requests at once against a limit of 2, then a polite client that honours retry-after.
 *
 * Post 06's service imports createLimiter from this file.
 *
 * Run:  npx tsx 03-load-shedding/example.ts   (no model needed; the "model" is a 300 ms wait)
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dump, isMain, section } from '@learn/shared';

// 1. A limiter is just a counter. tryAcquire() never waits: it says yes or no immediately.
export function createLimiter(max: number) {
  let inFlight = 0;
  return {
    tryAcquire: () => (inFlight < max ? (inFlight++, true) : false),
    release: () => void inFlight--,
    inFlight: () => inFlight,
  };
}

// ---- the demo (skipped when another file imports from here) -----------------------------------
if (isMain(import.meta.url)) {
  const limiter = createLimiter(2);

  const server = createServer(async (_req, res) => {
    // 2. Full? Shed the request now, and tell the client when to come back.
    if (!limiter.tryAcquire()) {
      res.writeHead(429, { 'retry-after': '1', 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'busy, retry later' }));
    }
    try {
      await new Promise((r) => setTimeout(r, 300)); // stands in for a slow model call
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ answer: 'ok' }));
    } finally {
      limiter.release(); // 3. ALWAYS release, even when the work throws
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ask`;

  section('[C] Six requests at once, limit 2');
  // The first shed request, as a small object: the full HTTP response shape is in lesson 09, post 01. Notice
  // status 429, the retry-after header and the JSON body: everything a client needs to back off (the polite
  // client below uses retry-after).
  let shownShed = false;
  const statuses = await Promise.all(
    Array.from({ length: 6 }, () =>
      fetch(url, { method: 'POST' }).then(async (r) => {
        if (r.status === 429 && !shownShed) {
          shownShed = true;
          dump('a shed request: 429', { status: r.status, statusText: r.statusText, retryAfter: r.headers.get('retry-after'), json: await r.json() });
        }
        return r.status;
      }),
    ),
  );
  console.log('  statuses:', statuses.join(' '));

  section('[C] A polite client: wait for retry-after, then try again (at most 3 tries)');
  async function politeAsk(id: number) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await fetch(url, { method: 'POST' });
      if (r.status !== 429) return `#${id}: ${r.status} on try ${attempt}`;
      const waitS = Number(r.headers.get('retry-after') ?? '1');
      await new Promise((ok) => setTimeout(ok, waitS * 1000 * (0.5 + Math.random()))); // jitter: don't all come back at once
    }
    return `#${id}: gave up`;
  }
  const results = await Promise.all([1, 2, 3, 4].map(politeAsk));
  results.forEach((line) => console.log('  ' + line));
  server.close();
  if (statuses.filter((s) => s === 429).length !== 4) throw new Error('expected 4 of 6 requests to be shed');
}
