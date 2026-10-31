# Post 08 · Kubernetes: probes, resources and autoscaling for an LLM service

*Series: [Lesson 09 — Deployment](../README.md) · Post 8 of 9 · about 30 minutes*

> The platform team gives you a namespace and says "it's just a Deployment". Then: the first pod is killed while it's still ingesting documents; a model outage restarts everything; the autoscaler never scales up although users wait 40 seconds; and a node upgrade takes both replicas down at once.

---

## The idea, in plain English

**Kubernetes** runs your container on a cluster, keeps the right number of copies (**pods**) alive, and sends them traffic through a **Service**. The manifests in [`k8s/`](../k8s/deployment.yaml) describe what you want; Kubernetes makes it so.

The parts that matter for an LLM service:

- **Three probes**, all HTTP:
  - **startup**: "has it finished starting?" Gives the first boot (which ingests documents) up to 5 minutes before the other probes start.
  - **readiness** (`/readyz`, post 04): fails → no traffic, no restart.
  - **liveness** (`/healthz`): fails 3 times → restart. Never touches the model.
- **Resources**: the pod itself is light; the model does the heavy lifting elsewhere (Ollama on GPU nodes, or a cloud API). Request little CPU, cap memory.
- **Security context**: non-root, no privilege escalation, read-only root filesystem, all Linux capabilities dropped.
- **Config and secrets**: model names in a **ConfigMap**; keys in a **Secret** (better: workload identity, no keys at all; lesson 08).
- **HPA** (HorizontalPodAutoscaler): adds pods under load. CPU is a *weak* signal here, because pods mostly **wait** on the model. Scaling on in-flight requests or 429 rate (with **KEDA** or custom metrics) fits better.
- **PDB** (PodDisruptionBudget): during node maintenance, keep at least one pod running.

---

## Let's see it in code

### Step 1 — the probes

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

```yaml
          livenessProbe: # "is the process wedged?" — keep it cheap, never call the model here
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
          readinessProbe: # "can it serve?" — index loaded + model backend reachable
            httpGet: { path: /readyz, port: http }
            periodSeconds: 5
            failureThreshold: 3
          startupProbe: # first boot ingests docs (embeddings) — give it time before liveness kicks in
            httpGet: { path: /healthz, port: http }
            periodSeconds: 5
            failureThreshold: 60
```

### Step 2 — resources and security

```yaml
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 512Mi }
```

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }
```

```yaml
            - { name: tmp, mountPath: /tmp } # RAG_DB_PATH lives here (rebuilt on start)
```

The one writable place is an `emptyDir` at `/tmp`, matching the image (post 07).

### Step 3 — shutdown timing

```yaml
      terminationGracePeriodSeconds: 30 # the app hard-stops at 25s (post 05); LLM answers can take a while
```

### Step 4 — autoscaling and disruption budget

```yaml
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

```yaml
spec:
  minAvailable: 1
```

### Step 5 — a probe simulator

No cluster? [`example.ts`](./example.ts) runs post 06's app and polls it like the kubelet would, with the same periods and thresholds (one "second" is 10 ms):

```ts
    // 2. Readiness: out of the Service after N failures, back in after one success. No restart.
```

```ts
    // 3. Liveness: N failures means "wedged" → the container is restarted.
```

While the backend is down, the demo fetches both probe paths once and dumps just `status` and `json` (the full HTTP response shape is in [post 01](../01-validate-at-the-edge/README.md#step-4--look-at-the-full-response); the probe endpoints are post 04's idea, built into the app in [post 06](../06-the-rag-service/README.md)). `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
// What the two probes see right now, as `status` and `json` only (the full HTTP response shape is in lesson 09,
// post 01). Notice /healthz still answers 200 (the process is fine) while /readyz answers 503 with the
// reason: that difference is why the pod is not restarted.
for (const path of ['/healthz', '/readyz']) {
  const r = await fetch(base + path);
  dump(`GET ${path}: status and json`, { status: r.status, json: await r.json() });
}
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:08           # the probe simulator: no cluster, no model
# or: npx tsx 08-kubernetes/example.ts

# with a cluster (edit image: and OLLAMA_BASE_URL first):
kubectl apply -f k8s/configmap.yaml -f k8s/deployment.yaml
kubectl port-forward svc/rag-api 8080:80
```

### What you should see

```
t=  0s  pod started (the startup probe on /healthz passes at once here; real first boots ingest docs first)
t=  8s  readiness ✅ → added to Service endpoints (gets traffic)
t= 13s  💥 model backend goes down
t= 26s  readiness ❌×3 → REMOVED from Service endpoints (no traffic, no restart)
t= 38s  liveness failures so far: 0, restarts: 0
▼ GET /healthz: status and json
{ status: 200, json: { ok: true } }
▼ GET /readyz: status and json
{ status: 503, json: { ready: false, reason: 'ollama unreachable' } }
t= 38s  🔧 model backend is back
t= 41s  readiness ✅ → added to Service endpoints (gets traffic)
```

The exact seconds can differ by one, depending on the first probe. The kubelet only looks at `status` (200–399 is a pass). The `reason` in the `/readyz` JSON is for you: `kubectl describe pod` doesn't show it, but `curl` on the pod does.

**Not tested by the course author:** applying the manifests to a real cluster. CI validates them with `kubeconform` on every push (post 09).

## Common gotchas

- ❌ **No startup probe**: liveness kills the pod during its first, slow ingest, forever.
- ❌ **Model calls in any probe** (post 04).
- ❌ **A CPU limit that throttles JSON work**, or no memory limit at all. Measure, then set.
- ❌ **`image: …:latest`** in a real environment. Pin the SHA tag CI built.
- ❌ **Expecting the CPU HPA to react to slow answers.** Waiting on a model uses no CPU. Scale on in-flight requests or queue depth.
- ✅ Two replicas minimum plus a PDB: one can always be moved while the other serves.

## Try it yourself

1. In the simulator, set the liveness probe to `/readyz`. What happens during the outage?
2. Lower `failureThreshold` of the startup probe to 3 and explain what would happen on a real first boot.
3. Sketch a KEDA `ScaledObject` that scales on the average `inFlight` value from the JSON logs (via Prometheus).

## Key takeaways

- **Startup** protects slow boots; **readiness** removes traffic; **liveness** restarts. Only liveness restarts, and it never checks the model.
- Light **resources**, a strict **security context**, writable `/tmp` only.
- **HPA on CPU** is a weak signal for LLM services; **PDB** keeps one pod up during maintenance.

---

[← Previous: The container image](../07-container-image/README.md) · [📚 Series index](../README.md) · [Next: CI with an eval gate →](../09-ci-eval-gate/README.md)
