/**
 * promptfoo grader provider (post 07) for model-graded assertions (llm-rubric).
 * Uses the AI SDK and JUDGE_MODEL (or CHAT_MODEL) from .env, so grading works with any provider,
 * and returns the {pass, score, reason} JSON promptfoo expects, via structured output.
 */
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { chatModel, optional } from '@learn/shared';

const Grade = z.object({ reason: z.string(), pass: z.boolean(), score: z.number().min(0).max(1) });

export default class JudgeProvider {
  id() {
    return 'ai-sdk-judge';
  }
  async callApi(prompt: string) {
    try {
      const { output } = await generateText({
        model: chatModel(optional('JUDGE_MODEL')),
        temperature: 0,
        output: Output.object({ schema: Grade }),
        prompt, // promptfoo's rubric prompt already contains the rubric, the output and the instructions
      });
      return { output: JSON.stringify(output) };
    } catch (e) {
      return { error: `judge failed: ${(e as Error).message}` };
    }
  }
}
