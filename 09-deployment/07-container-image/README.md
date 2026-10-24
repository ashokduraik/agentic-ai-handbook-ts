# Post 07 · The container image: small, non-root, the same everywhere

*Series: [Lesson 09 — Deployment](../README.md) · Post 7 of 9 · about 20 minutes*

> "Works on my machine." On the server, Node is a different version, a dev dependency is missing, the process runs as root, and the image is 1.8 GB because it contains your `.env`, the test data and three copies of `node_modules`.

---

## The idea, in plain English

A **container image** packages your app with exactly the runtime and dependencies it needs, so it runs the same on your laptop, in CI and in the cluster. A good image for this service is:

- **Pinned**: an exact Node version (`node:26.12.1-…`), not `node:latest`, which changes under you. It must be Node 22.5 or newer, because lesson 04's index uses the built-in `node:sqlite`.
- **Multi-stage**: one stage installs dependencies; the final stage copies only what's needed to run. Build tools and caches stay behind.
- **Reproducible**: `npm ci` installs exactly what `package-lock.json` says, production dependencies only.
- **Cache-friendly**: copy `package.json` files and install *before* copying source, so a code change doesn't reinstall everything.
- **Non-root**: `USER node`. If someone breaks in, they aren't root.
- **Read-only friendly**: the only writes go to `/tmp` (our index), so Kubernetes can mount the rest read-only (post 08).
- **Signal-friendly**: an exec-form `CMD ["node", …]`, so node is process 1 and receives `SIGTERM` (post 05).
- **Clean**: a `.dockerignore` keeps `.env`, `node_modules`, `data/` and `*.db` out.

There's **no TypeScript build step**: Node runs `.ts` files directly by stripping types, so the image ships the source.

---

## Let's see it in code

The [Dockerfile](../Dockerfile) is at the lesson root; build it from the **repo root**, because it needs `shared/` and `04-rag/` too.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the deps stage

```dockerfile
FROM node:26.12.1-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY 04-rag/package.json 04-rag/
COPY 09-deployment/package.json 09-deployment/
RUN npm ci --omit=dev --workspace 09-deployment --ignore-scripts --no-audit --no-fund
```

Only `package.json` files are copied before `npm ci`, so this layer is reused until dependencies change.

### Step 2 — the runtime stage

```dockerfile
FROM node:26.12.1-trixie-slim
ENV NODE_ENV=production PORT=8080 RAG_DB_PATH=/tmp/rag/rag.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
```

```dockerfile
COPY 04-rag ./04-rag
COPY 09-deployment ./09-deployment
USER node
EXPOSE 8080
# Node handles SIGTERM itself (post 05); exec form so it's PID 1 and receives the signal.
CMD ["node", "09-deployment/06-the-rag-service/server.ts"]
```

The runtime stage copies lesson 04's whole folder: its `pipeline/` library and the `docs/` the service ingests.

### Step 3 — checking it

[`example.ts`](./example.ts) checks the Dockerfile against the list above, one small test per practice:

```ts
  ['runs as a non-root user', instructions.some((l) => /^USER (?!root)/.test(l))],
  ['exec-form CMD, so node is PID 1 and gets SIGTERM', instructions.some((l) => /^CMD \[/.test(l))],
```

With `--build`, it runs the same build CI runs:

```ts
  execFileSync('docker', ['build', '-f', '09-deployment/Dockerfile', '-t', 'rag-api:dev', '.'], { cwd: repoRoot, stdio: 'inherit' });
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:07           # checks only, no Docker needed
npm run docker:build      # + docker build (needs Docker)
# or: npx tsx 07-container-image/example.ts

# then, from the repo root:
docker run --rm -p 8080:8080 --env-file .env -e OLLAMA_BASE_URL=http://host.docker.internal:11434 rag-api:dev
```

### What you should see

```
✅ multi-stage: a deps stage and a runtime stage
✅ base image pinned to an exact version (not :latest)
✅ npm ci (exact lockfile), production deps only
✅ package files copied BEFORE source (layer caching)
✅ runs as a non-root user
✅ exec-form CMD, so node is PID 1 and gets SIGTERM
✅ writable data only in /tmp (read-only root filesystem works)
✅ .env, node_modules and data are kept out of the image
```

**Not tested by the course author:** `docker build` and `docker run` (no Docker on the test machine). CI's `image` job builds this Dockerfile on every push.

## Common gotchas

- ❌ **`localhost` inside the container** means the container, not your laptop. Use `host.docker.internal` (Docker Desktop) or the service name in Kubernetes.
- ❌ **Copying `.env` into the image.** Secrets end up in every registry. Pass them at run time.
- ❌ **`CMD npm start`**: npm may swallow SIGTERM.
- ❌ **Writing outside `/tmp`** with a read-only root filesystem: "EROFS" errors at runtime.
- ❌ **Test helpers in production code paths.** Post 02 loads `ai/test` only inside its demo, so the server never needs it.
- ✅ Tag images with the git commit SHA, not `latest`, so you know exactly what's running.

## Try it yourself

1. Change `USER node` to `USER root` and run `npm run post:07`.
2. With Docker: build, then `docker run --read-only --tmpfs /tmp …`. Does the service still start?
3. With Docker: `docker history rag-api:dev`. Which layer is biggest?

## Key takeaways

- **Pinned, multi-stage, `npm ci --omit=dev`, non-root, exec-form CMD.**
- Copy package files before source for faster rebuilds; keep secrets and data out with `.dockerignore`.
- No build step: Node runs the TypeScript directly.

---

[← Previous: The RAG service](../06-the-rag-service/README.md) · [📚 Series index](../README.md) · [Next: Kubernetes →](../08-kubernetes/README.md)
