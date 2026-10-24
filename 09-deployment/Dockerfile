# Build from the REPO ROOT (the service depends on the shared + 04-rag workspaces):
#   docker build -f 09-deployment/Dockerfile -t rag-api:dev .
#   docker run --rm -p 8080:8080 --env-file .env -e OLLAMA_BASE_URL=http://host.docker.internal:11434 rag-api:dev
#
# No TypeScript build step: Node runs .ts files directly (type stripping), so the image
# ships source + production deps only. Walked through in post 07 (07-container-image/README.md).

# Base image: lesson 04's index uses node:sqlite, so Node 22.5 or newer is required. Pinned to an exact version.

# ---- deps: install production dependencies for just this workspace (and the workspaces it uses)
FROM node:26.12.1-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY 04-rag/package.json 04-rag/
COPY 09-deployment/package.json 09-deployment/
RUN npm ci --omit=dev --workspace 09-deployment --ignore-scripts --no-audit --no-fund

# ---- runtime: small, non-root, read-only friendly
FROM node:26.12.1-trixie-slim
ENV NODE_ENV=production PORT=8080 RAG_DB_PATH=/tmp/rag/rag.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
# The whole workspaces: the service imports code from several post folders. .dockerignore keeps out data/ and node_modules/.
COPY 04-rag ./04-rag
COPY 09-deployment ./09-deployment
USER node
EXPOSE 8080
# Node handles SIGTERM itself (post 05); exec form so it's PID 1 and receives the signal.
CMD ["node", "09-deployment/06-the-rag-service/server.ts"]
