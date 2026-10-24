/**
 * Post 02 — Azure OpenAI: deployments, API versions and keyless (Entra ID) auth
 * (read the blog post first: 02-azure-openai/README.md)
 *
 *   A. What your code really sends to Azure, captured by a fake fetch (no account needed):
 *        A1. key auth with the Responses API (the default)
 *        A2. the older Chat Completions API
 *        A3. Entra ID: a token provider instead of a key
 *   B. Only when AI_PROVIDER=azure and AZURE_* are set: a real call through @learn/shared.
 *      (Not tested by the course author: no Azure account was available.)
 *
 * Run:  npx tsx 02-azure-openai/example.ts            (A, + B on Azure)
 *       npx tsx 02-azure-openai/example.ts --offline  (A only)
 */
import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { chatModel, env, section } from '@learn/shared';
import { captureFetch, mask, type CapturedRequest } from '../support/fakes.ts';

const show = (r: CapturedRequest) =>
  console.log({
    url: r.url,
    auth: r.headers['api-key'] ? `api-key: ${mask(r.headers['api-key'])}` : `authorization: ${mask(r.headers['authorization'])}`,
    'body.model': r.body.model, // ← the DEPLOYMENT name, not "the model family"
  });

const { fetch, requests } = captureFetch();

section('[A1] Key auth, Responses API (the default)');
// resourceName = the <name> in https://<name>.openai.azure.com. The model id you pass is your DEPLOYMENT name.
const azure = createAzure({ resourceName: 'contoso-health-ai', apiKey: 'demo-key-0000-not-real', fetch });
await generateText({ model: azure('triage-prod'), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
show(requests.at(-1)!);

section('[A2] Chat Completions API (older deployments and some regions)');
await generateText({ model: azure.chat('triage-prod'), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
show(requests.at(-1)!);

section('[A3] Entra ID (managed identity): a token instead of a key');
// In production: import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
//   tokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')
// Here a fake token provider stands in, so you can see the header it produces.
const keyless = createAzure({ resourceName: 'contoso-health-ai', tokenProvider: async () => 'eyJ0eXAiOiJKV1QiLCJhbGciOi.fake', fetch });
await generateText({ model: keyless('triage-prod'), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
show(requests.at(-1)!);

if (process.argv.includes('--offline')) process.exit(0);

if (env.provider !== 'azure') {
  console.log(`\n[B] skipped: AI_PROVIDER is "${env.provider}". Set AI_PROVIDER=azure and AZURE_* in .env to call Azure for real.`);
} else {
  section('[B] A real call to your Azure deployment');
  const { text, usage } = await generateText({ model: chatModel(), prompt: 'In one sentence: what is triage?', maxOutputTokens: 200 });
  console.log(text, usage);
}
