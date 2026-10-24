/**
 * A faithfulness judge (post 04), RAGAS-style, in ~30 lines:
 *   1. a judge model breaks the answer into short factual claims
 *   2. for each claim, the judge decides: is it supported by the retrieved context?
 *   3. score = supported claims / all claims
 * AI SDK structured output, so it works with any provider and model that can return JSON.
 */
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

export async function faithfulness(judge: LanguageModel, answer: string, context: string[]) {
  // 1. Claims. A claim is one checkable statement: "children under 12 can visit the ICU".
  const { output: extracted } = await generateText({
    model: judge,
    temperature: 0,
    output: Output.object({ schema: z.object({ claims: z.array(z.string()).max(8) }) }),
    instructions: 'Split the answer into short, self-contained factual claims (max 8). Copy its meaning exactly.',
    prompt: `Answer:\n${answer}`,
  });
  if (extracted.claims.length === 0) return { score: 1, claims: [] }; // nothing claimed → nothing unfaithful

  // 2. One verdict per claim, against the SAME context the app saw.
  const ctx = context.map((c, i) => `[${i + 1}] ${c}`).join('\n');
  const verdicts = await Promise.all(
    extracted.claims.map(async (claim) => {
      const { output } = await generateText({
        model: judge,
        temperature: 0,
        output: Output.object({ schema: z.object({ supported: z.boolean() }) }),
        instructions: 'You check facts. supported=true only if the context directly states the claim. A claim that contradicts the context is NOT supported.',
        prompt: `Context:\n${ctx}\n\nClaim: "${claim}"`,
      });
      return { claim, supported: output.supported };
    }),
  );

  // 3. The score.
  return { score: verdicts.filter((v) => v.supported).length / verdicts.length, claims: verdicts };
}
