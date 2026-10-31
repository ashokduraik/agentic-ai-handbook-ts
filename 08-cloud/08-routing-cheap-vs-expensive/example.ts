/**
 * Post 08 — Putting it together: an in-process gateway that routes cheap vs expensive
 * (read the blog post first: 08-routing-cheap-vs-expensive/README.md)
 *
 *   A. The gateway: aliases (post 04) + defaults (post 05) + cache (post 06) + ledger (post 07).
 *   B. A router: short FAQ-style questions → 'fast', everything else → 'smart'.
 *   C. The ledger and cache stats after a small batch of questions.
 *
 * The same ideas exist as managed services (Azure API Management's AI gateway, Bedrock
 * inference profiles, a LiteLLM proxy). This file shows the mechanics.
 *
 * Run:  npx tsx 08-routing-cheap-vs-expensive/example.ts            (SMART_MODEL / FAST_MODEL, see post 04)
 *       npx tsx 08-routing-cheap-vs-expensive/example.ts --offline  (two fake models)
 */
import { customProvider, defaultSettingsMiddleware, generateText, wrapLanguageModel } from 'ai';
import { chatModel, env, optional, section } from '@learn/shared';
import { fakeModel, type ModelObject } from '../support/fakes.ts';
import { createCache } from '../06-response-cache/example.ts';
import { createLedger } from '../07-cost-ledger/example.ts';

const offline = process.argv.includes('--offline');

// 1. Shared policy objects: one cache and one ledger for the whole gateway.
const cache = createCache({ ttlMs: 10 * 60_000 });
const prices = { inPerMTok: Number(optional('PRICE_PER_MTOK_IN', '0')), outPerMTok: Number(optional('PRICE_PER_MTOK_OUT', '0')) };
const ledger = createLedger(() => prices);

// 2. Every model goes through the same middleware stack. Order matters: the cache sits OUTSIDE
//    the ledger, so a cache hit never reaches the ledger and costs nothing.
const governed = (model: ModelObject) =>
  wrapLanguageModel({
    model,
    middleware: [defaultSettingsMiddleware({ settings: { temperature: 0, maxOutputTokens: 512 } }), cache.middleware, ledger.middleware],
  });

const smartId = offline ? 'big-model' : optional('SMART_MODEL', env.chatModel)!;
const fastId = offline ? 'small-model' : optional('FAST_MODEL', env.fallbackModel ?? env.chatModel)!;
const base = (id: string): ModelObject => (offline ? fakeModel(id) : (chatModel(id) as ModelObject));

const gateway = customProvider({
  languageModels: { smart: governed(base(smartId)), fast: governed(base(fastId)) },
});

// 3. A naive router. Cheap rules first; measure it with evals (lesson 05) before you trust it.
type Alias = 'smart' | 'fast';
function route(question: string): Alias {
  const looksLikeFaq = question.length < 60 && /\b(when|what time|where|how much|open)\b/i.test(question);
  return looksLikeFaq ? 'fast' : 'smart';
}

const questions = [
  'What time should I arrive?',
  'What time should I arrive?', // identical → cache hit
  'Where is the radiology department?',
  'Summarise the risks of stopping blood thinners before knee surgery for a 70-year-old.',
];

section(`[A] Gateway   smart=${smartId}   fast=${fastId}`);
for (const q of questions) {
  const alias = route(q);
  const t0 = performance.now();
  const result = await generateText({ model: gateway.languageModel(alias), prompt: q });
  section(`[B] ${alias} · ${Math.round(performance.now() - t0)} ms`);
  // The full result is in lesson 01, post 00. Here: `response.modelId`, the model the router picked.
  // The first question is asked twice: the second time, the cache replays the stored response and the
  // ledger is not charged.
  console.log(`response.modelId=${result.response.modelId}`);
  const { text } = result;
  console.log(`Q: ${q}\nA: ${text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 200)}`);
}

section('[C] Ledger and cache');
console.table(Object.fromEntries(ledger.rows));
console.log(`cache hits=${cache.stats.hits} misses=${cache.stats.misses}   total spent $${ledger.spent().toFixed(4)}`);
// The ledger table and these counters are the shapes from posts 06 and 07 (`ledger.rows`, `cache.stats`).
// Notice the cache hit does NOT appear in the ledger: `calls` counts only requests that reached a model.
if (offline && (cache.stats.hits !== 1 || ledger.rows.size !== 2)) throw new Error('expected 1 cache hit and 2 models used');
