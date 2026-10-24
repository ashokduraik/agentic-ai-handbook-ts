/**
 * The model promptfoo uses to WRITE attacks and GRADE answers in `npm run redteam`.
 * It is JUDGE_MODEL from .env (falls back to CHAT_MODEL). Use your strongest model here:
 * a weak judge writes weak attacks and grades noisily.
 */
import { generateText } from 'ai';
import { chatModel, optional, stripThinking } from '@learn/shared';

export default class JudgeProvider {
  id() {
    return 'judge';
  }
  async callApi(prompt: string) {
    try {
      const { text } = await generateText({ model: chatModel(optional('JUDGE_MODEL')), prompt, maxOutputTokens: 2048 });
      return { output: stripThinking(text) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
