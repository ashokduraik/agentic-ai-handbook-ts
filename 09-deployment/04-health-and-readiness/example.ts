/**
 * Post 04 — Health vs readiness: "am I alive?" is not "can I serve?"
 * (read the blog post first: 04-health-and-readiness/README.md)
 *
 *   A. checkReady(): what "ready" means for each provider.
 *      Ollama: both CHAT_MODEL and EMBED_MODEL are pulled (GET /api/tags).
 *      Azure: resource name and key set. Bedrock: a region set. OpenAI-compatible: a base URL set.
 *   B. Offline: three fake Ollama situations (all good, a model missing, Ollama down).
 *   C. Live: the real check against your .env.
 *
 * Post 06's service imports checkReady from this file.
 *
 * Run:  npx tsx 04-health-and-readiness/example.ts            (checks your real setup)
 *       npx tsx 04-health-and-readiness/example.ts --offline  (fake Ollama answers)
 */
import { env, isMain, optional, section } from '@learn/shared';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// Ollama lists "llama3" as "llama3:latest", so compare with the tag filled in.
const withTag = (name: string) => (name.includes(':') ? name : `${name}:latest`);

/** 1. Cheap, fast checks only: readiness runs every few seconds on every pod. Never call the model here. */
export async function checkReady(fetchImpl: Fetch = fetch): Promise<{ ready: boolean; reason: string }> {
  switch (env.provider) {
    case 'ollama': {
      try {
        const r = await fetchImpl(`${env.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(1000) }); // 2. short timeout
        if (!r.ok) return { ready: false, reason: `ollama answered ${r.status}` };
        const pulled = new Set(((await r.json()) as { models: { name: string }[] }).models.map((m) => withTag(m.name)));
        const missing = [env.chatModel, env.embedModel].filter((m) => !pulled.has(withTag(m)));
        return missing.length ? { ready: false, reason: `not pulled: ${missing.join(', ')}` } : { ready: true, reason: 'both models pulled' };
      } catch (e) {
        return { ready: false, reason: `ollama unreachable (${(e as Error).name})` };
      }
    }
    // 3. Cloud providers: check configuration, not the network. A cloud blip shouldn't pull every pod
    //    out of service at once; alert on the error rate instead.
    case 'azure':
      return optional('AZURE_RESOURCE_NAME') && optional('AZURE_API_KEY') ? { ready: true, reason: 'azure configured' } : { ready: false, reason: 'AZURE_RESOURCE_NAME / AZURE_API_KEY missing' };
    case 'bedrock':
      return optional('AWS_REGION') ? { ready: true, reason: 'bedrock region set' } : { ready: false, reason: 'AWS_REGION missing' };
    case 'openai-compatible':
      return optional('OPENAI_COMPAT_BASE_URL') ? { ready: true, reason: 'base URL set' } : { ready: false, reason: 'OPENAI_COMPAT_BASE_URL missing' };
    default:
      return { ready: false, reason: `unknown AI_PROVIDER ${env.provider}` };
  }
}

// ---- the demo (skipped when another file imports from here) -----------------------------------
if (isMain(import.meta.url)) {
  if (process.argv.includes('--offline')) {
    process.env.AI_PROVIDER = 'ollama';
    process.env.CHAT_MODEL = 'chat-small';
    process.env.EMBED_MODEL = 'embed-small';
    const tags = (...names: string[]): Fetch => async () => Response.json({ models: names.map((name) => ({ name })) });
    const down: Fetch = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'TypeError' });
    };

    section('[B] Three fake Ollama situations');
    const results = [
      ['both models pulled', await checkReady(tags('chat-small:latest', 'embed-small:latest'))],
      ['embedding model missing', await checkReady(tags('chat-small:latest'))],
      ['Ollama down', await checkReady(down)],
    ] as const;
    for (const [label, r] of results) console.log(`  ${label.padEnd(24)} → ready=${r.ready}  (${r.reason})`);
    if (results.map(([, r]) => r.ready).join() !== 'true,false,false') throw new Error('unexpected readiness results');
  } else {
    section(`[C] Your setup (AI_PROVIDER=${env.provider})`);
    console.log(' ', await checkReady());
  }
}
