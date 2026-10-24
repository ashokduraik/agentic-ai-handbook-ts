/**
 * The HTTP app: posts 01–05 put together around one /ask endpoint. Plain node:http, no framework.
 *
 *   validate at the edge (post 01) · timeouts that abort (post 02) · load shedding (post 03)
 *   /healthz vs /readyz (post 04) · a draining flag for graceful shutdown (post 05)
 *   + one JSON log line per request
 *
 * createApp(deps) takes the RAG pipeline as a dependency, so tests inject a fake (example.ts)
 * and server.ts injects the real one.
 */
import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { AskBody, HttpError, readJson, send } from '../01-validate-at-the-edge/example.ts';
import { isTimeout, requestSignal } from '../02-timeouts-that-abort/example.ts';
import { createLimiter } from '../03-load-shedding/example.ts';

export interface AskResult {
  answer: string;
  citations: number[];
  answerable: boolean;
  citationsValid: boolean;
}

export interface Deps {
  ask(question: string, abortSignal: AbortSignal): Promise<AskResult>; // must pass abortSignal on to the model call
  ready(): Promise<{ ready: boolean; reason: string }>;
  maxConcurrent: number;
  timeoutMs: number;
}

export function createApp(deps: Deps): Server & { startDraining(): void } {
  const limiter = createLimiter(deps.maxConcurrent);
  let draining = false;

  const server = createServer(async (req, res) => {
    const t0 = performance.now();
    // One structured log line per request: your log stack can count statuses and chart latency.
    const log = (status: number, extra: object = {}) =>
      console.log(JSON.stringify({ level: 'info', method: req.method, path: req.url, status, ms: Math.round(performance.now() - t0), inFlight: limiter.inFlight(), ...extra }));

    if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true }); // alive: nothing else
    if (req.method === 'GET' && req.url === '/readyz') {
      const r = draining ? { ready: false, reason: 'draining' } : await deps.ready().catch(() => ({ ready: false, reason: 'check failed' }));
      return send(res, r.ready ? 200 : 503, r);
    }
    if (req.method !== 'POST' || req.url !== '/ask') return send(res, 404, { error: 'not found' });

    if (!limiter.tryAcquire()) {
      res.setHeader('retry-after', '2');
      log(429);
      return send(res, 429, { error: 'busy, retry later' });
    }
    try {
      const parsed = AskBody.safeParse(await readJson(req));
      if (!parsed.success) {
        log(400);
        return send(res, 400, { error: 'invalid request', issues: z.flattenError(parsed.error).fieldErrors });
      }
      const result = await deps.ask(parsed.data.question, requestSignal(res, deps.timeoutMs));
      log(200, { answerable: result.answerable, citationsValid: result.citationsValid });
      send(res, 200, result);
    } catch (e) {
      const status = isTimeout(e) ? 504 : e instanceof HttpError ? e.status : 500;
      log(status, { error: (e as Error).message });
      if (!res.headersSent && !res.destroyed) send(res, status, { error: status === 500 ? 'internal error' : status === 504 ? 'timeout' : (e as Error).message });
    } finally {
      limiter.release();
    }
  });

  return Object.assign(server, { startDraining: () => void (draining = true) });
}
