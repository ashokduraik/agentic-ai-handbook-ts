/**
 * Post 07 — A cost ledger and a budget: know what each model costs, and stop before it's too much
 * (read the blog post first: 07-cost-ledger/README.md)
 *
 *   A. createLedger(): middleware that adds up calls, tokens and dollars per model.
 *   B. A budget check that refuses new calls once the spend limit is reached.
 *
 * Prices come from .env (per million tokens). Self-hosted models: leave them unset ($0).
 * Post 08 imports createLedger from this file.
 *
 * Run:  npx tsx 07-cost-ledger/example.ts            (CHAT_MODEL)
 *       npx tsx 07-cost-ledger/example.ts --offline  (a fake model and example prices)
 */
import { generateText, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { chatModel, dump, isMain, optional, section } from '@learn/shared';
import { fakeModel, type ModelObject } from '../support/fakes.ts';

export interface Prices {
  inPerMTok: number; // $ per million input tokens
  outPerMTok: number; // $ per million output tokens
}
export interface LedgerRow {
  calls: number;
  input: number;
  output: number;
  usd: number;
}

export function createLedger(pricesFor: (modelId: string) => Prices, { budgetUsd = Infinity } = {}) {
  const rows = new Map<string, LedgerRow>();
  const spent = () => [...rows.values()].reduce((sum, r) => sum + r.usd, 0);

  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, model }) => {
      // 1. The budget check runs BEFORE the call, so an over-budget call costs nothing.
      if (spent() >= budgetUsd) throw new Error(`Budget of $${budgetUsd} reached: refusing a new call to ${model.modelId}`);

      const result = await doGenerate();

      // 2. Add this call's tokens and cost to the model's row.
      const input = result.usage.inputTokens.total ?? 0;
      const output = result.usage.outputTokens.total ?? 0;
      const p = pricesFor(model.modelId);
      const row = rows.get(model.modelId) ?? { calls: 0, input: 0, output: 0, usd: 0 };
      row.calls++;
      row.input += input;
      row.output += output;
      row.usd += (input * p.inPerMTok + output * p.outPerMTok) / 1e6;
      rows.set(model.modelId, row);
      return result;
    },
  };
  return { middleware, rows, spent };
}

// ---- the demo (skipped when another file imports createLedger) --------------------------------
if (isMain(import.meta.url)) {
  const offline = process.argv.includes('--offline');

  // 3. Prices are configuration. Offline ignores .env and uses made-up prices that trip the $0.30
  // budget after three mock calls (so `test:offline` is stable even when PRICE_* is 0 in .env).
  const prices: Prices = offline
    ? { inPerMTok: 2000, outPerMTok: 8000 }
    : {
        inPerMTok: Number(optional('PRICE_PER_MTOK_IN', '0')),
        outPerMTok: Number(optional('PRICE_PER_MTOK_OUT', '0')),
      };
  const ledger = createLedger(() => prices, { budgetUsd: offline ? 0.3 : Number(optional('BUDGET_USD', '1')) });
  const model = wrapLanguageModel({
    model: offline ? fakeModel('mock-model') : (chatModel() as ModelObject),
    middleware: ledger.middleware,
  });

  section('[A+B] Five questions against the budget');
  const questions = ['When is the lab open?', 'Where do I park?', 'Can I eat before a blood test?', 'How do I get my results?', 'Who do I call after hours?'];
  for (const q of questions) {
    try {
      const r = await generateText({ model, prompt: q, maxOutputTokens: 200 });
      console.log(`  ✅ ${q.padEnd(32)} spent so far $${ledger.spent().toFixed(4)}`);
      // The full result is in lesson 01, post 00. We log just `usage.inputTokens` and `usage.outputTokens` of
      // the first call: the numbers the ledger multiplies by the prices.
      if (q === questions[0]) console.log(`     first call usage: inputTokens=${r.usage.inputTokens} outputTokens=${r.usage.outputTokens}`);
    } catch (e) {
      console.log(`  ⛔ ${q.padEnd(32)} ${(e as Error).message}`);
      // The error the budget check threw is a plain Error whose message is printed above: the model was never called.
    }
  }

  section('Ledger');
  console.table(Object.fromEntries([...ledger.rows].map(([id, r]) => [id, { ...r, usd: Number(r.usd.toFixed(4)) }])));
  // The raw ledger record behind the table: one row per model id, `usd` not rounded.
  dump('ledger.rows', ledger.rows);
  if (offline && ledger.rows.get('mock-model')?.calls !== 3) throw new Error('expected the budget to stop calls after 3');
}
