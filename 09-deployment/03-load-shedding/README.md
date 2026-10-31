# Post 03 · Load shedding: "busy, retry later" beats queueing forever

*Series: [Lesson 09 — Deployment](../README.md) · Post 3 of 9 · about 15 minutes*

> Shift change at 7 a.m.: forty nurses ask questions within two minutes. The model can handle four at a time. Requests pile up in memory, every answer takes minutes, browsers time out and resend, and the pile grows. Eventually the pod runs out of memory and everyone gets nothing.

---

## The idea, in plain English

Every LLM backend has a ceiling: a GPU can only generate so many tokens per second, and a cloud deployment has a tokens-per-minute quota. Above that ceiling, accepting more requests doesn't make more answers; it only makes every answer slower.

**Load shedding** means refusing the extra work *quickly* instead of queueing it:

- Count the requests **in flight**. Below the limit: accept. At the limit: answer **429 Too Many Requests** at once.
- Add a **`retry-after`** header (seconds), so clients know when to come back.
- Well-behaved clients wait, with some random **jitter**, so they don't all come back in the same millisecond.

A fast "busy" is better than a slow failure: the requests you accept stay fast, the pod stays healthy, and 429s are easy to count and alert on. Choose the limit by measuring (lesson 07): roughly how many parallel calls your model handles before latency climbs.

---

## Let's see it in code

Open [`example.ts`](./example.ts). The "model" is a 300 ms wait; the limit is 2.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the limiter

```ts
// 1. A limiter is just a counter. tryAcquire() never waits: it says yes or no immediately.
export function createLimiter(max: number) {
  let inFlight = 0;
  return {
    tryAcquire: () => (inFlight < max ? (inFlight++, true) : false),
    release: () => void inFlight--,
    inFlight: () => inFlight,
  };
}
```

### Step 2 — shed with a 429

```ts
    // 2. Full? Shed the request now, and tell the client when to come back.
    if (!limiter.tryAcquire()) {
      res.writeHead(429, { 'retry-after': '1', 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'busy, retry later' }));
    }
```

```ts
      limiter.release(); // 3. ALWAYS release, even when the work throws
```

### Step 3 — look at one shed response

The demo dumps the first 429 as a small object. The full HTTP response shape (every header) is in [post 01](../01-validate-at-the-edge/README.md#step-4--look-at-the-full-response), so here we pick out `status`, `statusText`, the one header that matters (`retry-after`) and the JSON body. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
  // The first shed request, as a small object: the full HTTP response shape is in lesson 09, post 01. Notice
  // status 429, the retry-after header and the JSON body: everything a client needs to back off (the polite
  // client below uses retry-after).
```

```ts
          dump('a shed request: 429', { status: r.status, statusText: r.statusText, retryAfter: r.headers.get('retry-after'), json: await r.json() });
```

### Step 4 — a polite client

```ts
      const waitS = Number(r.headers.get('retry-after') ?? '1');
      await new Promise((ok) => setTimeout(ok, waitS * 1000 * (0.5 + Math.random()))); // jitter: don't all come back at once
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:03           # no model needed
# or: npx tsx 03-load-shedding/example.ts
```

### What you should see

```
▼ a shed request: 429
{
  status: 429,
  statusText: 'Too Many Requests',
  retryAfter: '1',
  json: { error: 'busy, retry later' }
}
statuses: 200 200 429 429 429 429
#1: 200 on try 1
#2: 200 on try 1
#3: 200 on try 2
#4: 200 on try 2
```

The 429 comes back at once, without waiting for the 300 ms "model". `retry-after: '1'` is in seconds, and it is a string: the polite client converts it with `Number()`. Which client needs a second try depends on the random jitter.

## Common gotchas

- ❌ **Forgetting `release()` on errors.** Use `finally`, or the limiter slowly "fills up" and the pod sheds everything.
- ❌ **A per-pod limit that ignores the backend.** Four pods × limit 4 = 16 calls to an Ollama that handles 4. Set the limit from the *backend's* capacity divided by the pod count, or limit at the gateway.
- ❌ **Clients that retry immediately and forever.** Honour `retry-after`, add jitter, cap the tries.
- ❌ **Shedding health checks.** `/healthz` and `/readyz` must never be limited (post 06 checks them first).
- ✅ Count 429s on a dashboard: a steady stream means you need more capacity (post 08's autoscaler).

## Try it yourself

1. Set the limit to 3 and send 10 requests. How many 429s?
2. Remove the jitter from the polite client. Do more clients need a third try?
3. Change the limiter to allow a *small* queue (say, 2 waiting) before shedding. When is that better?

## Key takeaways

- The model has a ceiling; above it, accept less, not more.
- **Shed** with a fast `429` + `retry-after`; always release the slot.
- Clients should wait, add **jitter**, and give up after a few tries.

---

[← Previous: Timeouts that really stop the work](../02-timeouts-that-abort/README.md) · [📚 Series index](../README.md) · [Next: Health vs readiness →](../04-health-and-readiness/README.md)
