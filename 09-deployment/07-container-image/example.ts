/**
 * Post 07 — The container image: small, non-root, and the same everywhere
 * (read the blog post first: 07-container-image/README.md)
 *
 *   A. Check the lesson's Dockerfile (and the repo's .dockerignore) against the practices in the post.
 *   B. With --build, and Docker installed: build the image and print its size.
 *
 * Run:  npx tsx 07-container-image/example.ts          (checks only, no Docker needed)
 *       npx tsx 07-container-image/example.ts --build  (also docker build, from the repo root)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dump, section } from '@learn/shared';

const repoRoot = new URL('../../', import.meta.url).pathname;
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('../../.dockerignore', import.meta.url), 'utf8');
const instructions = dockerfile.split('\n').filter((l) => /^[A-Z]+\s/.test(l)); // skip comments and blank lines
// The Dockerfile lines the checks below read. Notice the two FROM lines (two stages) and the USER line.
dump('Dockerfile instructions', instructions);

// 1. Each practice is one small, readable test on the Dockerfile text.
const checks: [string, boolean][] = [
  ['multi-stage: a deps stage and a runtime stage', instructions.filter((l) => l.startsWith('FROM ')).length >= 2],
  ['base image pinned to an exact version (not :latest)', instructions.filter((l) => l.startsWith('FROM ')).every((l) => /:\d+\.\d+\.\d+/.test(l))],
  ['npm ci (exact lockfile), production deps only', instructions.some((l) => /npm ci .*--omit=dev/.test(l))],
  ['package files copied BEFORE source (layer caching)', instructions.findIndex((l) => l.includes('package-lock.json')) < instructions.findIndex((l) => l.startsWith('COPY shared '))],
  ['runs as a non-root user', instructions.some((l) => /^USER (?!root)/.test(l))],
  ['exec-form CMD, so node is PID 1 and gets SIGTERM', instructions.some((l) => /^CMD \[/.test(l))],
  ['writable data only in /tmp (read-only root filesystem works)', /RAG_DB_PATH=\/tmp\//.test(dockerfile)],
  ['.env, node_modules and data are kept out of the image', ['.env', '**/node_modules', '**/data'].every((p) => dockerignore.split('\n').includes(p))],
];

section('[A] Dockerfile checks');
for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);

if (process.argv.includes('--build')) {
  section('[B] docker build (from the repo root)');
  // 2. The same command CI runs (docker/build-push-action with file: 09-deployment/Dockerfile).
  execFileSync('docker', ['build', '-f', '09-deployment/Dockerfile', '-t', 'rag-api:dev', '.'], { cwd: repoRoot, stdio: 'inherit' });
  console.log(execFileSync('docker', ['image', 'ls', 'rag-api:dev', '--format', '{{.Repository}}:{{.Tag}}  {{.Size}}']).toString());
}
