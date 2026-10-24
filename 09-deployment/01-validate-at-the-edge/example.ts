/**
 * Post 01 — Validate at the edge: reject bad requests before they cost a model call
 * (read the blog post first: 01-validate-at-the-edge/README.md)
 *
 *   A. readJson(): read the body with a size limit, and turn bad JSON into a 400.
 *   B. AskBody: a zod schema for what /ask accepts.
 *   C. A tiny server, and five requests: one good, four bad.
 *
 * Post 06's service imports readJson, send, HttpError and AskBody from this file.
 *
 * Run:  npx tsx 01-validate-at-the-edge/example.ts   (no model needed)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { isMain, section } from '@learn/shared';

/** An error that knows its HTTP status, so the handler can answer 400/413/504 instead of 500. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 1. What /ask accepts. trim() first, so "   " counts as too short.
export const AskBody = z.object({ question: z.string().trim().min(3).max(500) });

export function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// 2. Read the body, but stop at a limit: a 50 MB "question" should never reach your memory or your model.
export async function readJson(req: IncomingMessage, limitBytes = 16_384): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new HttpError(413, 'payload too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

// ---- the demo (skipped when another file imports from here) -----------------------------------
if (isMain(import.meta.url)) {
  // 3. The handler: read, validate, and answer with a clear error. Never a stack trace.
  const server = createServer(async (req, res) => {
    try {
      const parsed = AskBody.safeParse(await readJson(req));
      if (!parsed.success) return send(res, 400, { error: 'invalid request', issues: z.flattenError(parsed.error).fieldErrors });
      send(res, 200, { ok: true, question: parsed.data.question }); // post 06 calls the model here
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: status === 500 ? 'internal error' : (e as Error).message });
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ask`;
  const post = async (label: string, body: string) => {
    const r = await fetch(url, { method: 'POST', body });
    console.log(`  ${label.padEnd(26)} → ${r.status} ${JSON.stringify(await r.json())}`);
    return r.status;
  };

  section('[C] Five requests');
  const statuses = [
    await post('a good question', JSON.stringify({ question: '  How much is the no-show deposit? ' })),
    await post('too short', JSON.stringify({ question: 'hi' })),
    await post('wrong field name', JSON.stringify({ q: 'How much is the deposit?' })),
    await post('not JSON', 'question=deposit'),
    await post('20 KB body', JSON.stringify({ question: 'x'.repeat(20_000) })),
  ];
  server.close();
  if (statuses.join() !== '200,400,400,400,413') throw new Error(`unexpected statuses ${statuses}`);
}
