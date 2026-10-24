/**
 * Preflight: is Ollama reachable and are CHAT_MODEL / EMBED_MODEL pulled?
 * Run: npm run check:ollama
 */
import { env, optional } from './env.ts';

const res = await fetch(`${env.ollamaBaseUrl}/api/tags`).catch((e: unknown) => {
  console.error(`✗ Cannot reach Ollama at ${env.ollamaBaseUrl}: ${String(e)}`);
  process.exit(1);
});
const { models } = (await res.json()) as { models: { name: string }[] };
const have = new Set(models.map((m) => m.name));
const norm = (n: string) => (n.includes(':') ? n : `${n}:latest`);
console.log(`✓ Ollama reachable at ${env.ollamaBaseUrl} (${models.length} models)`);
for (const key of ['CHAT_MODEL', 'EMBED_MODEL', 'FALLBACK_MODEL', 'JUDGE_MODEL']) {
  const v = optional(key);
  if (!v) {
    console.log(`  ${key}: (not set)`);
    continue;
  }
  console.log(`  ${have.has(norm(v)) ? '✓' : '✗ not pulled —'} ${key}=${v}`);
}
