/**
 * Post 05 — Ready-made scorers with autoevals   (read the blog post first: 05-autoevals/README.md)
 *
 * autoevals (by Braintrust) ships tested judge prompts: Faithfulness, Factuality, Relevance, and more.
 * It speaks the OpenAI API, so we point it at Ollama's OpenAI-compatible /v1 endpoint.
 * Same two answers as post 04, plus Factuality against the golden reference answer.
 *
 * Run: npx tsx 05-autoevals/example.ts   (needs AI_PROVIDER=ollama; uses JUDGE_MODEL, or CHAT_MODEL)
 */
import OpenAI from 'openai';
import { Factuality, Faithfulness, init } from 'autoevals';
import { dump, env, optional, section } from '@learn/shared';
import { cases } from '../02-golden-dataset/dataset.ts';

if (env.provider !== 'ollama') {
  console.log(`AI_PROVIDER=${env.provider}: this example wires autoevals to Ollama's /v1 API. See the post for other providers.`);
  process.exit(0);
}

// 1. Point autoevals at any OpenAI-compatible endpoint: Ollama, a gateway, Azure OpenAI…
const client = new OpenAI({ baseURL: `${env.ollamaBaseUrl}/v1`, apiKey: 'ollama' });
const judgeModel = optional('JUDGE_MODEL', env.chatModel)!;
init({
  // Same openai major as autoevals, but npm may nest a second copy → TS sees two distinct classes.
  client: client as unknown as NonNullable<Parameters<typeof init>[0]>['client'],
  defaultModel: judgeModel,
});

const icu = cases.find((c) => c.id === 'icu-children')!;
const context = [
  'ICU visiting is limited to immediate family, 11:00–12:00 and 18:00–19:00. Visitors must perform hand hygiene and wear a gown. Children under 12 may not visit the ICU unless approved by the charge nurse.',
];
const answers = {
  faithful: 'No. Children under 12 may not visit the ICU unless the charge nurse approves [1].',
  flipped: 'Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse [1].',
};

const dumped = new Set<string>(); // each scorer's full result is dumped once; later results log only the fields that explain the score

/** A scorer is a model call: it can throw. Record null ("no score"), never a pass. */
async function score(label: string, fn: () => Promise<{ score: number | null }> | { score: number | null }) {
  try {
    const result = await fn();
    if (!dumped.has(label)) {
      dumped.add(label);
      // The full scorer result, FIRST one per scorer only. Notice `metadata`: Factuality's `choice` (A-E) and `rationale`
      // explain the score; Faithfulness lists the statements it extracted and its verdicts.
      dump(`${label} result`, result);
    } else {
      const meta = (result as { metadata?: { choice?: string; rationale?: string } }).metadata;
      console.log(`${label}: score=${result.score}${meta?.choice ? ` choice=${meta.choice}` : ''}`);
      console.log(`    rationale: ${meta?.rationale ?? '(none)'}`);
    }
    return result.score;
  } catch (e) {
    console.log(`    (judge failed: ${(e as Error).message.slice(0, 100)})`);
    return null;
  }
}

console.log(`judge: ollama:${judgeModel} via ${env.ollamaBaseUrl}/v1`);
for (const [label, output] of Object.entries(answers)) {
  section(`${label}: "${output}"`);
  // 2. Faithfulness: is every statement in the output supported by the context?
  const faithful = await score('Faithfulness', () => Faithfulness({ input: icu.question, output, context }));
  // 3. Factuality: does the output agree with the reference answer from the golden dataset?
  const factual = await score('Factuality', () => Factuality({ input: icu.question, output, expected: icu.reference }));
  console.log({ faithful, factual });
}
