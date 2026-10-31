# Post 05 · Graceful shutdown: finish the answers you started

*Series: [Lesson 09 — Deployment](../README.md) · Post 5 of 9 · about 15 minutes*

> You deploy a new version at 10 a.m. Kubernetes replaces the pods one by one. Every pod being replaced kills the answers it was writing: twelve nurses see "connection reset" halfway through a discharge summary. Deploys become something you only do at night.

---

## The idea, in plain English

When Kubernetes wants a pod gone (a deploy, scaling down, a node being drained), it doesn't just kill it. It:

1. sends the process **`SIGTERM`** ("please stop"),
2. waits up to **`terminationGracePeriodSeconds`** (30 s by default),
3. then sends **`SIGKILL`** (no more chances).

A graceful app uses that window:

1. **Stop new traffic**: make `/readyz` answer 503, so the load balancer stops sending requests here.
2. **Stop accepting connections**: `server.close()`.
3. **Finish what's in flight**: `server.close()`'s callback runs when the last request is done. Then exit 0.
4. **A hard stop** just before Kubernetes' deadline (25 s of 30), so you exit on your own terms.

For LLM services the window matters more than usual, because answers take seconds. Set the grace period longer than your slowest normal answer.

---

## Let's see it in code

Open [`example.ts`](./example.ts). The demo starts a 1-second request, then sends `SIGTERM` to itself.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — readiness off first

```ts
    // 1. Tell the load balancer first: /readyz now answers 503, so no NEW traffic is sent here.
    onDraining();
```

### Step 2 — stop accepting, drain, exit

```ts
    // 2. Stop accepting connections. The callback runs once every in-flight request has finished.
    server.close(() => {
      console.log(JSON.stringify({ level: 'info', msg: 'drained, exiting' }));
      process.exit(0);
    });
    server.closeIdleConnections(); // keep-alive connections with nothing in flight can go now
```

### Step 3 — the hard stop

```ts
    // 3. A hard stop, just under Kubernetes' terminationGracePeriodSeconds (30 s by default).
    setTimeout(() => process.exit(1), hardStopMs).unref();
```

`.unref()` means this timer alone won't keep the process alive.

### Step 4 — look at both requests

The in-flight request is logged as just its `status` and text: the full HTTP response shape is in [post 01](../01-validate-at-the-edge/README.md#step-4--look-at-the-full-response). The error the late request gets is new, so the demo dumps that one whole. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
    // Notice status 200 and the whole text: draining let the request finish instead of cutting the
    // connection. Just those two fields: the full HTTP response shape is in lesson 09, post 01.
    console.log(`${at()}  in-flight request → ${r.status} "${await r.text()}"`);
```

```ts
      // The error fetch threw. Notice the useful part is in `cause`: code ECONNREFUSED, nobody listening.
      dump('new request: fetch error', e);
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:05           # no model needed
# or: npx tsx 05-graceful-shutdown/example.ts
```

### What you should see

(Millisecond values and the port number vary from run to run.)

```
  206 ms  sending SIGTERM (what Kubernetes does on a rolling update)
{"level":"info","msg":"SIGTERM: draining"}
  260 ms  new request → refused (connect ECONNREFUSED 127.0.0.1:42239)
▼ new request: fetch error
TypeError {
  name: 'TypeError',
  message: 'fetch failed',
  cause: Error {
    name: 'Error',
    message: 'connect ECONNREFUSED 127.0.0.1:42239',
    errno: -111,
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '127.0.0.1',
    port: 42239
  }
}
  (hidden for readability: cause.stack, stack — set SHOW_RAW=1 to print everything)
 1011 ms  in-flight request → 200 "here is your answer"
{"level":"info","msg":"drained, exiting"}
```

The answer that was being written still arrived, after the signal: status 200 and the whole text. The new request never reached the server. fetch only says `fetch failed`; the reason is in `cause`: `code: 'ECONNREFUSED'` means nothing was listening on that port any more.

## Common gotchas

- ❌ **`CMD npm start` in the Dockerfile.** npm may not pass `SIGTERM` on to node, so your handler never runs. Use `CMD ["node", "…"]` (post 07).
- ❌ **A hard stop longer than the grace period.** Kubernetes kills you first; the hard stop never runs.
- ❌ **Grace period shorter than your slowest answer.** Raise `terminationGracePeriodSeconds` (post 08), or stream and accept the cut.
- ❌ **Forgetting keep-alive connections.** Idle ones can hold `server.close()` open; close them.
- ✅ In a real cluster, endpoints update a moment *after* SIGTERM. Some teams wait a few seconds (a `preStop` sleep) before closing, so in-flight routing settles.

## Try it yourself

1. Make the slow request take 7 seconds with `hardStopMs: 5000`. What exit code do you get?
2. Press Ctrl+C while `npm start` is answering a question (SIGINT uses the same handler).
3. Add a `preStop` sleep of 5 s to `k8s/deployment.yaml` and work out the new timeline.

## Key takeaways

- Kubernetes sends **SIGTERM**, waits the grace period, then **SIGKILL**.
- On SIGTERM: readiness off → stop accepting → finish in-flight → exit 0, with a hard stop just under the deadline.
- Exec-form `CMD` so node actually receives the signal.

---

[← Previous: Health vs readiness](../04-health-and-readiness/README.md) · [📚 Series index](../README.md) · [Next: The RAG service →](../06-the-rag-service/README.md)
