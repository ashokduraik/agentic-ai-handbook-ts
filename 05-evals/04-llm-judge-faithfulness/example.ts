/**
 * Post 04 — An LLM judge for faithfulness   (read the blog post first: 04-llm-judge-faithfulness/README.md)
 *
 * The answer from lesson 04, post 08 cited the right source and passed every code check (post 03),
 * yet flipped the ICU rule. Can a model-as-judge catch what string checks can't?
 * We judge a faithful answer and the flipped one against the same retrieved ICU section.
 *
 * Run: npx tsx 04-llm-judge-faithfulness/example.ts            (JUDGE_MODEL, or CHAT_MODEL if unset)
 *      npx tsx 04-llm-judge-faithfulness/example.ts --offline  (a word-overlap fake judge: watch it fail)
 */
import { chatModel, dump, modelLabel, optional, section } from '@learn/shared';
import { fakeModel } from '@learn/rag/offline-fakes';
import { faithfulness } from './faithfulness.ts';

const offline = process.argv.includes('--offline');

// The context the app retrieved (the ICU section of 04-rag/docs/visiting-hours.md).
const context = [
  'ICU visiting is limited to immediate family, 11:00–12:00 and 18:00–19:00. Visitors must perform hand hygiene and wear a gown. Children under 12 may not visit the ICU unless approved by the charge nurse.',
];
const answers = {
  faithful: 'No. Children under 12 may not visit the ICU unless the charge nurse approves [1].',
  flipped: 'Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse. They must follow the hand hygiene and gown requirements [1].',
};

// Offline: claims = sentences; "supported" = most of the claim's words appear in the context.
// Words, not meaning: exactly the blind spot of the code checks in post 03.
const overlapJudge = fakeModel((p) => {
  if (p.includes('Split the answer')) {
    const answer = p.split('Answer:\\n')[1]?.split('"')[0] ?? '';
    return { claims: answer.split(/(?<=\.)\s+/).filter(Boolean) };
  }
  const ctx = (p.split('Claim: ')[0] ?? '').toLowerCase();
  const words = (p.split('Claim: ')[1] ?? '').toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return { supported: words.filter((w) => ctx.includes(w)).length / Math.max(1, words.length) > 0.6 };
}, 'word-overlap-judge');

const judgeId = optional('JUDGE_MODEL');
const judge = offline ? overlapJudge : chatModel(judgeId);
console.log(`judge: ${offline ? 'offline word-overlap fake' : modelLabel(judgeId)}`);

for (const [label, answer] of Object.entries(answers)) {
  section(`${label}: "${answer}"`);
  try {
    const result = await faithfulness(judge, answer, context);
    result.claims.forEach((c) => console.log(`  ${c.supported ? '✅' : '❌'} ${c.claim}`));
    console.log(`  faithfulness = ${result.score.toFixed(2)}`);
    // The full faithfulness() result: `claims` is what the judge extracted, each with its verdict,
    // and `score` = supported / all. Notice how the claims are worded: a judge that rephrases a claim
    // (drops a "not") can make a wrong answer look faithful.
    dump('faithfulness() result', result);
  } catch (e) {
    console.log(`  judge failed: ${(e as Error).message.slice(0, 120)}  ← judges are models too; record this as "no score", never as a pass`);
  }
}
