/**
 * Post 01 — One interface, many providers: switching clouds is a .env change
 * (read the blog post first: 01-provider-abstraction/README.md)
 *
 * The provider is chosen by AI_PROVIDER in .env (see shared/src/models.ts); this file never
 * imports a vendor SDK.
 *
 *   AI_PROVIDER=ollama             CHAT_MODEL=<ollama model>               (default, local)
 *   AI_PROVIDER=azure              CHAT_MODEL=<your Azure deployment name>  + AZURE_RESOURCE_NAME, AZURE_API_KEY
 *   AI_PROVIDER=bedrock            CHAT_MODEL=<Bedrock model / inference-profile id> + AWS_REGION + AWS credentials
 *   AI_PROVIDER=openai-compatible  CHAT_MODEL=<model>  + OPENAI_COMPAT_BASE_URL (vLLM, LiteLLM, LM Studio...)
 *
 *   A. Show the resolved configuration (no network).
 *   B. Structured output + an embedding through whichever provider is active.
 *
 * Run:  npx tsx 01-provider-abstraction/example.ts            (A + B)
 *       npx tsx 01-provider-abstraction/example.ts --offline  (A only; --dry also works)
 */
import { embed, generateText, Output } from 'ai';
import { z } from 'zod';
import { chatModel, embeddingModel, env, modelLabel, optional, section } from '@learn/shared';

// What each provider needs from .env. Bedrock can also use AWS_PROFILE / SSO / an IAM role instead of keys.
const NEEDS: Record<string, string[]> = {
  ollama: ['OLLAMA_BASE_URL'],
  azure: ['AZURE_RESOURCE_NAME', 'AZURE_API_KEY'],
  bedrock: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  'openai-compatible': ['OPENAI_COMPAT_BASE_URL'],
};

section('[A] Resolved configuration');
console.log({ provider: env.provider, chat: modelLabel(), embed: modelLabel(env.embedModel) });
for (const name of NEEDS[env.provider] ?? []) {
  const v = optional(name);
  // Never print secrets: show only whether they're set.
  console.log(`  ${name.padEnd(24)} ${v ? (/KEY|SECRET/.test(name) ? 'set (hidden)' : v) : '— not set'}`);
}
if (process.argv.includes('--offline') || process.argv.includes('--dry')) process.exit(0);

section('[B] Structured output through whichever provider is active');
const result = await generateText({
  model: chatModel(), // ← the ONLY place a model appears, and it comes from .env
  output: Output.object({
    schema: z.object({ department: z.enum(['cardiology', 'orthopedics', 'general']), urgent: z.boolean() }),
  }),
  maxOutputTokens: 1024,
  prompt: 'Triage: "crushing chest pain for 20 minutes". Return the department and whether it is urgent.',
});
// The full result is in lesson 01, post 00 (structured output: post 07). Log only the provider-specific
// parts: `response.modelId` and `steps[0].model.provider`.
console.log('response.modelId:', result.response.modelId, '  steps[0].model.provider:', result.steps[0]!.model.provider);
const { output, usage } = result;
console.log(output, usage);

section('[B] Embeddings through the same abstraction');
const embedded = await embed({ model: embeddingModel(), value: 'appointment cancellation policy' });
// The full embed() result is in lesson 01, post 06. We only need the vector's size: it depends on the model.
const { embedding } = embedded;
console.log(`dimensions=${embedding.length} (changes per provider → re-index your vector store when you switch!)`);
