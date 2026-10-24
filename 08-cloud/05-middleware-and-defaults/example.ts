/**
 * Post 05 — Middleware: one place to enforce defaults and policies for every call
 * (read the blog post first: 05-middleware-and-defaults/README.md)
 *
 *   A. defaultSettingsMiddleware: temperature 0 and a 512-token cap unless a call says otherwise.
 *   B. Two tiny custom middlewares, to see the order they run in.
 *   C. What the model actually received.
 *
 * Run:  npx tsx 05-middleware-and-defaults/example.ts            (CHAT_MODEL)
 *       npx tsx 05-middleware-and-defaults/example.ts --offline  (a fake model)
 */
import { defaultSettingsMiddleware, generateText, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { chatModel, section } from '@learn/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { fakeModel, type ModelObject } from '../support/fakes.ts';

const offline = process.argv.includes('--offline');

// 1. A middleware is an object with optional hooks. transformParams changes the call BEFORE the model sees it.
const logParams = (name: string): LanguageModelMiddleware => ({
  specificationVersion: 'v4',
  transformParams: async ({ params }) => {
    console.log(`  ${name.padEnd(6)} sees temperature=${params.temperature} maxOutputTokens=${params.maxOutputTokens}`);
    return params; // must return the (possibly changed) params
  },
});

// 2. wrapGenerate runs AROUND the model call: code before and after doGenerate().
const timer: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  wrapGenerate: async ({ doGenerate, model }) => {
    const t0 = performance.now();
    const result = await doGenerate(); // ← the actual model call
    console.log(`  timer  ${model.modelId} took ${Math.round(performance.now() - t0)} ms`);
    return result;
  },
};

// 3. Wrap once, use everywhere. The FIRST middleware in the list is the OUTERMOST.
const governed = (model: ModelObject) =>
  wrapLanguageModel({
    model,
    middleware: [
      logParams('outer'), // sees the call as the app made it
      defaultSettingsMiddleware({ settings: { temperature: 0, maxOutputTokens: 512 } }),
      logParams('inner'), // sees it after the defaults were applied
      timer,
    ],
  });

const base = offline ? fakeModel('mock-model') : (chatModel() as ModelObject);
const model = governed(base);
const ask = (prompt: string, maxOutputTokens?: number) =>
  generateText({ model, prompt, maxOutputTokens }).then((r) => r.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 120));

section('[A+B] A call that sets nothing: the defaults fill in');
console.log('  →', await ask('What should I bring to my first appointment? One sentence.'));

section('[A+B] A call that sets its own limit: the call wins over the default');
console.log('  →', await ask('Say hello to the patient in five words.', 200));

if (base instanceof MockLanguageModelV4) {
  section('[C] What the fake model received (offline self-check)');
  const seen = base.doGenerateCalls.map((c) => ({ temperature: c.temperature, maxOutputTokens: c.maxOutputTokens }));
  console.log(seen);
  if (seen[0]?.maxOutputTokens !== 512 || seen[1]?.maxOutputTokens !== 200 || seen[0]?.temperature !== 0) throw new Error('defaults not applied as expected');
  console.log('✅ defaults applied, and the per-call value won');
}
