/**
 * Post 02 — The GenAI semantic conventions: a model-call span, written by hand
 * (read the blog post first: 02-genai-semantic-conventions/README.md)
 *
 * Do this once by hand so you know what the AI SDK records for you in post 03:
 *   span name      "{gen_ai.operation.name} {gen_ai.request.model}"  e.g. "chat qwen3:0.6b"
 *   span kind      CLIENT (we call a remote model)
 *   attributes     gen_ai.operation.name, gen_ai.provider.name, gen_ai.request.model,
 *                  gen_ai.request.max_tokens / temperature, gen_ai.response.finish_reasons,
 *                  gen_ai.usage.input_tokens / output_tokens, error.type on failure
 *   content        prompts/answers are OPT-IN (they may contain PHI): recorded only if OTEL_CAPTURE_CONTENT=true
 *
 *   A. a successful call      B. a failing call (unknown model)
 *
 * Run:  npx tsx 02-genai-semantic-conventions/example.ts            (your CHAT_MODEL)
 *       npx tsx 02-genai-semantic-conventions/example.ts --offline  (a fake model)
 */
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
} from '@opentelemetry/semantic-conventions/incubating'; // GenAI semconv is still "Development" status
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { generateText, type LanguageModel } from 'ai';
import { chatModel, env, optional, section } from '@learn/shared';
import { setupTracing } from '../01-traces-and-spans/tracing.ts';
import { failingModel, scriptedModel } from '../support/mock.ts';

const offline = process.argv.includes('--offline');
const { tracer, shutdown } = setupTracing('07-post-02');
const captureContent = optional('OTEL_CAPTURE_CONTENT') === 'true'; // off by default: prompts can contain PHI

async function tracedChat(model: LanguageModel, modelName: string, prompt: string) {
  const maxTokens = 256;
  const temperature = 0;
  return tracer.startActiveSpan(
    `chat ${modelName}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_PROVIDER_NAME]: offline ? 'mock' : env.provider,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelName,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: maxTokens,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: temperature,
      },
    },
    async (span) => {
      try {
        if (captureContent) span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: prompt }] }]));
        const r = await generateText({ model, prompt, maxOutputTokens: maxTokens, temperature, telemetry: { isEnabled: false } }); // we write the span ourselves here; post 03 lets the SDK do it
        span.setAttributes({
          [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [r.finishReason],
          [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: r.usage.inputTokens ?? 0,
          [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: r.usage.outputTokens ?? 0,
        });
        if (captureContent) span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: r.text }] }]));
        return r.text;
      } catch (e) {
        // Errors: set error.type + status so dashboards can count failures per model.
        span.recordException(e as Error);
        span.setAttribute(ATTR_ERROR_TYPE, (e as Error).name ?? 'Error');
        span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
        throw e;
      } finally {
        span.end();
      }
    },
  );
}

section('[A] A successful call');
const model = offline ? scriptedModel({ text: 'Bring your ID, insurance card and a list of current medicines.' }) : chatModel();
const name = offline ? 'scripted' : env.chatModel;
console.log('answer:', await tracedChat(model, name, 'In one sentence: what should a patient bring to a first clinic visit?'));

section('[B] A failing call (unknown model) → error.type + ERROR status');
try {
  const broken = offline ? failingModel() : chatModel('this-model-does-not-exist');
  await tracedChat(broken, 'this-model-does-not-exist', 'hi');
} catch (e) {
  console.log('caught:', (e as Error).message.slice(0, 100));
}
await shutdown();
