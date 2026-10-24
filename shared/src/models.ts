/**
 * Provider-agnostic model factory.
 *
 * The AI SDK's key idea: your app code depends on the `LanguageModel` / `EmbeddingModel`
 * interfaces, never on a vendor SDK. Swapping Ollama -> Azure OpenAI -> Bedrock is a
 * config change (AI_PROVIDER + model/deployment names), not a code change.
 */
import type { EmbeddingModel, LanguageModel } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { env, required, optional } from './env.ts';

function ollama() {
  // The provider talks to Ollama's native /api endpoints (not the /v1 OpenAI shim).
  return createOllama({ baseURL: `${env.ollamaBaseUrl}/api` });
}

/**
 * @param modelId optional override; defaults to CHAT_MODEL.
 * For azure the id is your *deployment* name; for bedrock a Bedrock model id.
 */
export function chatModel(modelId: string = env.chatModel): LanguageModel {
  switch (env.provider) {
    case 'ollama':
      return ollama()(modelId);
    case 'azure':
      // AZURE_RESOURCE_NAME + AZURE_API_KEY are read from env by the provider as well.
      return createAzure({
        resourceName: required('AZURE_RESOURCE_NAME'),
        apiKey: required('AZURE_API_KEY'),
      })(modelId);
    case 'bedrock':
      // Uses the standard AWS credential env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ...).
      return createAmazonBedrock({ region: optional('AWS_REGION', 'us-east-1') })(modelId);
    case 'openai-compatible':
      // Any OpenAI-compatible server: vLLM, LM Studio, LiteLLM proxy, a gateway, etc.
      return createOpenAICompatible({
        name: 'compat',
        baseURL: required('OPENAI_COMPAT_BASE_URL'),
        apiKey: optional('OPENAI_COMPAT_API_KEY'),
        supportsStructuredOutputs: true,
      }).chatModel(modelId);
    default:
      throw new Error(`Unknown AI_PROVIDER "${env.provider}"`);
  }
}

export function embeddingModel(modelId: string = env.embedModel): EmbeddingModel {
  switch (env.provider) {
    case 'ollama':
      return ollama().embedding(modelId);
    case 'azure':
      return createAzure({
        resourceName: required('AZURE_RESOURCE_NAME'),
        apiKey: required('AZURE_API_KEY'),
      }).embeddingModel(modelId);
    case 'bedrock':
      return createAmazonBedrock({ region: optional('AWS_REGION', 'us-east-1') }).embeddingModel(modelId);
    case 'openai-compatible':
      return createOpenAICompatible({
        name: 'compat',
        baseURL: required('OPENAI_COMPAT_BASE_URL'),
        apiKey: optional('OPENAI_COMPAT_API_KEY'),
      }).embeddingModel(modelId);
    default:
      throw new Error(`Unknown AI_PROVIDER "${env.provider}"`);
  }
}

/** Human-readable label for logs, e.g. "ollama:my-model". */
export const modelLabel = (id: string = env.chatModel) => `${env.provider}:${id}`;
