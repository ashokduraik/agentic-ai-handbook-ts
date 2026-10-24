/**
 * Post 04 — Model aliases: ask for a capability ("smart", "fast"), not a model id
 * (read the blog post first: 04-model-aliases/README.md)
 *
 *   A. Define aliases with customProvider. Which real model sits behind each comes from .env.
 *   B. App code asks for an alias. Re-pointing an alias changes no app code.
 *
 * .env:  SMART_MODEL (defaults to CHAT_MODEL)   FAST_MODEL (defaults to FALLBACK_MODEL, then CHAT_MODEL)
 *
 * Run:  npx tsx 04-model-aliases/example.ts            (your models)
 *       npx tsx 04-model-aliases/example.ts --offline  (two fake models)
 */
import { customProvider, generateText } from 'ai';
import { chatModel, env, optional, section } from '@learn/shared';
import { fakeModel } from '../support/fakes.ts';

const offline = process.argv.includes('--offline');

// 1. The real model behind each alias is configuration. Offline, two fakes stand in.
const smartId = offline ? 'big-model' : optional('SMART_MODEL', env.chatModel)!;
const fastId = offline ? 'small-model' : optional('FAST_MODEL', env.fallbackModel ?? env.chatModel)!;

// 2. One "provider" that knows only aliases. Asking for an unknown alias throws NoSuchModelError.
const models = customProvider({
  languageModels: {
    smart: offline ? fakeModel(smartId) : chatModel(smartId), // careful reasoning, longer answers, higher cost
    fast: offline ? fakeModel(fastId) : chatModel(fastId), // short FAQ answers, low cost
  },
});

// 3. A type for the alias names, so a typo is a compile error, not a 3 a.m. incident.
type Alias = 'smart' | 'fast';

/** App code: it knows what KIND of model it needs, not which vendor or version. */
async function answer(alias: Alias, question: string) {
  const { text, response } = await generateText({
    model: models.languageModel(alias),
    instructions: 'You are a hospital front-desk assistant. Answer in one or two sentences.',
    prompt: question,
    maxOutputTokens: 300,
  });
  return { modelId: response.modelId, text: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() };
}

section(`[A] Aliases → models   smart=${smartId}   fast=${fastId}`);

section('[B] App code asks for aliases');
console.log('fast  →', await answer('fast', 'What time does the pharmacy open?'));
console.log('smart →', await answer('smart', 'Why should a patient on blood thinners tell the dentist before an extraction?'));
