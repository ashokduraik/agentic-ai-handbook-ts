/**
 * Post 02 — The context window   (read the blog post first: 02-context-window/README.md)
 *
 * Two ideas, shown separately:
 *   A. Everything you send shares ONE fixed token budget. When a long chat no longer fits,
 *      YOU decide what to keep (system prompt + newest turns), instead of letting it be cut silently.
 *   B. The model remembers NOTHING between calls. "Memory" = you re-send the history each time.
 *
 * Run:  npx tsx 02-context-window/example.ts            (A + B; B calls your CHAT_MODEL)
 *       npx tsx 02-context-window/example.ts --offline  (A only)
 */
import { generateText, type ModelMessage } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { chatModel, dump, section, stripThinking } from '@learn/shared';

const tokenizer = getEncoding('o200k_base');
// Each message costs its text PLUS a few hidden tokens: the chat template wraps every message with
// markers and a role label (Qwen: <|im_start|>user\n … <|im_end|>\n). ~4 is a common rough estimate;
// it is a budget, not a bill, so leave a safety margin when the budget is tight. (See the README, Step 1.)
const tokensOf = (m: ModelMessage) => tokenizer.encode(String(m.content)).length + 4;

// ---------------------------------------------------------------------------
// Part A: fit a long conversation into a budget
// ---------------------------------------------------------------------------
section('[A] A 40-turn chat does not fit a 1,500-token budget — so we choose what stays');

const BUDGET = 1500; // pretend our model's context window is this small
const RESERVED_FOR_ANSWER = 300; // the answer ALSO uses the window — reserve room for it

const system: ModelMessage = { role: 'system', content: 'You are a ward-round assistant. Be brief.' };
const history = Array.from({ length: 40 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `Turn ${i}: ${'details about bed allocation and lab results '.repeat(8)}`,
})) as ModelMessage[];

// Strategy: always keep the system prompt (the rules), then keep the NEWEST messages that fit,
// and leave a short note where older ones were removed.
function fitToBudget(sys: ModelMessage, msgs: ModelMessage[], budget: number): ModelMessage[] {
  let used = tokensOf(sys);
  const kept: ModelMessage[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (used + tokensOf(msgs[i]!) > budget) {
      kept.unshift({ role: 'user', content: `[${i + 1} earlier messages omitted to fit the context window]` });
      break;
    }
    used += tokensOf(msgs[i]!);
    kept.unshift(msgs[i]!);
  }
  return [sys, ...kept];
}

const all = [system, ...history];
const fitted = fitToBudget(system, history, BUDGET - RESERVED_FOR_ANSWER);
const sum = (ms: ModelMessage[]) => ms.reduce((n, m) => n + tokensOf(m), 0);

console.log(`Before: ${all.length} messages ≈ ${sum(all)} tokens  (budget ${BUDGET}, of which ${RESERVED_FOR_ANSWER} reserved for the answer)`);
console.log(`After:  ${fitted.length} messages ≈ ${sum(fitted)} tokens`);
console.log('Kept first :', fitted[0]!.content);
console.log('Then a note:', fitted[1]!.content);

// The raw return value of fitToBudget(): an ordinary ModelMessage[] — exactly what you would pass
// as `messages`. Notice: the system message, then our "omitted" note (role 'user'), then the
// newest turns, oldest first. (Only the first 3 are printed; the rest look like the third.)
dump(`fitToBudget() result — first 3 of ${fitted.length} messages`, fitted.slice(0, 3));

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part B: the model has no memory between calls
// ---------------------------------------------------------------------------
section('[B] No memory between calls — unless you re-send the history');

const first: ModelMessage = { role: 'user', content: 'My patient in bed 12 is Rahul. Just say "noted".' };
const question: ModelMessage = { role: 'user', content: 'Who is in bed 12? Answer with the name only.' };

// Call 1 — only the question. The model never saw "Rahul" in THIS call.
const withoutHistory = await generateText({ model: chatModel(), messages: [question], maxOutputTokens: 300, temperature: 0 });
console.log('Without history:', stripThinking(withoutHistory.text));
// `usage.inputTokens` = how many tokens we sent. Here only the question was sent, so it is small.
// (The full generateText() result was shown in post 00, so we only print the field we want to compare.)
console.log('Input tokens without history:', withoutHistory.usage.inputTokens);

// Call 2 — the same question, but we send the earlier turns along with it.
const withHistory = await generateText({
  model: chatModel(),
  messages: [first, { role: 'assistant', content: 'noted' }, question],
  maxOutputTokens: 300,
  temperature: 0,
});
console.log('With history:   ', stripThinking(withHistory.text));
// Compare `usage.inputTokens` with the call above. It is larger, because we re-sent the earlier
// turns — memory is paid for in input tokens on every call.
// (In the full result, `response.messages` holds the assistant turn you would append to the history
// for the next call; see post 00 for the whole object.)
console.log('Input tokens with history:   ', withHistory.usage.inputTokens);
