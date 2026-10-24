/**
 * promptfoo custom provider (post 07): wraps OUR app (lesson 04) so promptfoo tests the real pipeline
 * (retrieve + rerank + answer), not a bare prompt. promptfoo calls callApi() once per test.
 */
import { HybridStore, answer, ingestDir, retrieve } from '@learn/rag';
import { stripThinking } from '@learn/shared';

let store: Promise<HybridStore> | undefined;
const getStore = () =>
  (store ??= (async () => {
    const s = new HybridStore(); // in-memory, built once per promptfoo run
    await ingestDir(s);
    return s;
  })());

export default class RagAppProvider {
  id() {
    return 'rag-app';
  }
  async callApi(prompt: string) {
    try {
      const { top } = await retrieve(await getStore(), prompt);
      const a = await answer(prompt, top);
      return {
        output: stripThinking(a.answer),
        // metadata is visible to assertions as context.metadata
        metadata: { answerable: a.answerable, citationsValid: a.citationsValid, sources: top.map((t) => t.source) },
      };
    } catch (e) {
      return { error: (e as Error).message }; // promptfoo reports it as an error, not a pass
    }
  }
}
