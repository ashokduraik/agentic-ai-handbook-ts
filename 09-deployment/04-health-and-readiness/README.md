# Post 04 · Health vs readiness: "am I alive?" is not "can I serve?"

*Series: [Lesson 09 — Deployment](../README.md) · Post 4 of 9 · about 20 minutes*

> Ollama restarts for an update and is gone for two minutes. Your pods' health check calls the model, fails, and Kubernetes **restarts every pod**. They come back, Ollama is still down, they're restarted again. When Ollama returns, all your pods are in the middle of a restart loop, and the service is down longer than Ollama was.

---

## The idea, in plain English

Kubernetes (post 08) asks your app two different questions, on two endpoints:

| | `/healthz` (liveness) | `/readyz` (readiness) |
|---|---|---|
| Question | "Is this process stuck?" | "Can it answer requests right now?" |
| Checks | Nothing but "the server answers" | The index is loaded and the model backend is usable |
| When it fails | The container is **restarted** | The pod gets **no traffic** until it passes again; **no restart** |

A model outage is a readiness problem: restarting your app can't fix Ollama. So liveness stays trivial, and readiness checks dependencies.

What "the model backend is usable" means depends on the provider:

- **Ollama**: it answers, *and* both `CHAT_MODEL` and `EMBED_MODEL` are pulled (`GET /api/tags`). A pod pointing at a model that isn't pulled can't answer anything.
- **Azure / Bedrock / OpenAI-compatible**: the configuration is present (resource and key, a region, a base URL). Don't call the cloud on every probe: a short cloud blip would pull *every* pod out of service at once. Alert on the error rate instead.

Readiness probes run every few seconds on every pod, so the check must be **cheap** (no model calls) and **fast** (a short timeout).

---

## Let's see it in code

Open [`example.ts`](./example.ts). `checkReady()` is what post 06's `/readyz` calls.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `env` reads the settings from `.env` (provider, model names, Ollama URL); `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo; `optional(name, default)` reads an optional setting from the environment; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — Ollama: are both models pulled?

```ts
        const r = await fetchImpl(`${env.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(1000) }); // 2. short timeout
        if (!r.ok) return { ready: false, reason: `ollama answered ${r.status}` };
        const pulled = new Set(((await r.json()) as { models: { name: string }[] }).models.map((m) => withTag(m.name)));
        const missing = [env.chatModel, env.embedModel].filter((m) => !pulled.has(withTag(m)));
```

`withTag` handles Ollama listing `llama3` as `llama3:latest`.

### Step 2 — cloud providers: configuration only

```ts
    // 3. Cloud providers: check configuration, not the network. A cloud blip shouldn't pull every pod
    //    out of service at once; alert on the error rate instead.
    case 'azure':
      return optional('AZURE_RESOURCE_NAME') && optional('AZURE_API_KEY') ? { ready: true, reason: 'azure configured' } : { ready: false, reason: 'AZURE_RESOURCE_NAME / AZURE_API_KEY missing' };
```

### Step 3 — the fetch is a parameter

```ts
export async function checkReady(fetchImpl: Fetch = fetch): Promise<{ ready: boolean; reason: string }> {
```

That's what lets the offline demo test three Ollama situations with fake answers.

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:04:offline   # three fake Ollama situations
npm run post:04           # your real setup
# or: npx tsx 04-health-and-readiness/example.ts
```

### What you should see

```
both models pulled       → ready=true  (both models pulled)
embedding model missing  → ready=false  (not pulled: embed-small)
Ollama down              → ready=false  (ollama unreachable (TypeError))
```

Live on the box: `{ ready: true, reason: 'both models pulled' }`.

## Common gotchas

- ❌ **Calling the model in a liveness probe.** A model outage restarts all your pods.
- ❌ **Calling the model in a readiness probe.** Slow and costly, every few seconds, on every pod.
- ❌ **No timeout on the check.** A hanging dependency makes the probe itself time out.
- ❌ **"Ready" before the index is loaded.** Traffic arrives and every question fails. Post 06's `ready()` also checks the index.
- ✅ Return a **reason** with the status: `kubectl describe pod` and your logs then say *why* a pod isn't ready.

## Try it yourself

1. Set `EMBED_MODEL` in `.env` to a model you haven't pulled and run `npm run post:04`.
2. Stop Ollama and run it again. How long does the check take, and why?
3. Add a check that the index has at least one chunk, and the reason "index empty" (post 06 does this; try it first).

## Key takeaways

- **Liveness** = "not stuck" (trivial). **Readiness** = "can serve" (dependencies).
- Readiness failure removes traffic **without a restart**: right for model outages.
- For Ollama, check both models are pulled; for cloud providers, check configuration and alert on errors.

---

[← Previous: Load shedding](../03-load-shedding/README.md) · [📚 Series index](../README.md) · [Next: Graceful shutdown →](../05-graceful-shutdown/README.md)
