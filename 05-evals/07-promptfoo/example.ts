/**
 * Post 07 — promptfoo   (read the blog post first: 07-promptfoo/README.md)
 *
 * promptfoo itself runs with `npm run promptfoo`. This file calls our two providers EXACTLY the way
 * promptfoo does (new Provider().callApi(prompt)), so you can see and debug what promptfoo receives
 * before running the whole suite.
 *
 * Run: npx tsx 07-promptfoo/example.ts ["your question"]   (EMBED_MODEL, CHAT_MODEL, JUDGE_MODEL if set)
 */
import { dump, section } from '@learn/shared';
import JudgeProvider from './judge-provider.ts';
import RagAppProvider from './rag-provider.ts';

const question = process.argv.slice(2).join(' ') || 'Can a 9 year old visit their grandfather in the ICU?';

section(`1. rag-app provider ← "${question}"`);
const app = await new RagAppProvider().callApi(question);
console.log(app); // { output, metadata: { answerable, citationsValid, sources } } — what assertions see

section('2. judge provider ← an llm-rubric style prompt');
const rubric = 'Says children under 12 may NOT visit the ICU unless the charge nurse approves. Fail if it says they can visit by default.';
const grade = await new JudgeProvider().callApi(
  `You are grading output according to a rubric. Rubric: ${rubric}\nOutput: ${'output' in app ? app.output : app.error}\n` +
    'Reply as JSON with reason, pass (boolean) and score (0 to 1).',
);
console.log(grade); // { output: '{"reason":…,"pass":…,"score":…}' } — promptfoo parses this JSON
// The grade as promptfoo will read it, parsed from that string. Notice `pass` decides the test and
// `reason` is what the promptfoo report shows next to it.
if ('output' in grade && grade.output) dump('grade.output, parsed', JSON.parse(grade.output));
