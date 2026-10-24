/**
 * Post 03 — Amazon Bedrock: model access, inference profiles and the AWS credential chain
 * (read the blog post first: 03-amazon-bedrock/README.md)
 *
 *   A. What your code really sends to Bedrock, captured by a fake fetch (no account needed):
 *        A1. static keys → a SigV4-signed request to the Converse API
 *        A2. a credential provider (how SSO, profiles and IAM roles plug in)
 *   B. Only when AI_PROVIDER=bedrock and AWS credentials are set: a real call through @learn/shared.
 *      (Not tested by the course author: no AWS account was available.)
 *
 * Run:  npx tsx 03-amazon-bedrock/example.ts            (A, + B on Bedrock)
 *       npx tsx 03-amazon-bedrock/example.ts --offline  (A only)
 */
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { chatModel, env, section } from '@learn/shared';
import { captureFetch, mask } from '../support/fakes.ts';

const { fetch, requests } = captureFetch();

// A cross-region INFERENCE PROFILE id: the "eu." prefix lets Bedrock serve it from several EU regions.
// (A made-up id: use one from your Bedrock console → Model catalog / Inference profiles.)
const MODEL_ID = 'eu.example-vendor.example-model-v1:0';

section('[A1] Static keys → a SigV4-signed request');
const bedrock = createAmazonBedrock({
  region: 'eu-central-1',
  accessKeyId: 'AKIAEXAMPLEEXAMPLE00', // fake: never put real keys in code
  secretAccessKey: 'fake-secret',
  fetch,
});
await generateText({ model: bedrock(MODEL_ID), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
const r = requests.at(-1)!;
console.log({
  url: r.url, // region-specific endpoint + the model id + the Converse API
  authorization: r.headers['authorization']?.split(',')[0], // "AWS4-HMAC-SHA256 Credential=<key id>/<date>/<region>/bedrock/aws4_request"
  'x-amz-date': r.headers['x-amz-date'],
});

section('[A2] A credential provider (SSO, profiles, IAM roles)');
// In production: import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
//   credentialProvider: fromNodeProviderChain()   ← env vars, ~/.aws profile/SSO, ECS/EKS/EC2 roles, in that order
// Here a fake provider returns short-lived credentials, like an assumed role would.
const viaRole = createAmazonBedrock({
  region: 'eu-central-1',
  credentialProvider: async () => ({ accessKeyId: 'ASIATEMPORARYEXAMPLE', secretAccessKey: 'fake', sessionToken: 'fake-session-token' }),
  fetch,
});
await generateText({ model: viaRole(MODEL_ID), prompt: 'Hello', maxRetries: 0 }).catch(() => {});
const r2 = requests.at(-1)!;
console.log({ authorization: r2.headers['authorization']?.split(',')[0], 'x-amz-security-token': mask(r2.headers['x-amz-security-token']) });

if (process.argv.includes('--offline')) process.exit(0);

if (env.provider !== 'bedrock') {
  console.log(`\n[B] skipped: AI_PROVIDER is "${env.provider}". Set AI_PROVIDER=bedrock, AWS_REGION and credentials in .env to call Bedrock for real.`);
} else {
  section('[B] A real call to Bedrock');
  const { text, usage } = await generateText({ model: chatModel(), prompt: 'In one sentence: what is triage?', maxOutputTokens: 200 });
  console.log(text, usage);
}
