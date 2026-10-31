# Post 03 · Code checks

*Series: [Lesson 05 — Evals](../README.md) · Post 3 of 7 · about 25 minutes*

> You have eight golden cases. Running them through a judge model costs a few calls each, and the judge can be wrong too.
>
> But "did it retrieve the right document?", "did it refuse?", "does it mention SAR 100?" are questions a few lines of TypeScript can answer, for free, in microseconds, identically every time.

Always start with **code checks**: deterministic functions over the app's output. They catch most everyday regressions. Then look honestly at what they **can't** catch, because that's where the next two posts come in.

---

## The idea, in plain English

### Five cheap checks

| Check | Question | Catches |
|---|---|---|
| `hit3` | is the expected document in the top 3 retrieved? | retrieval broke (chunking, embedding model, search change) |
| `refusalOk` | did the app answer/refuse as the case says? | inventing answers; refusing answerable questions |
| `contains` | does at least one synonym appear? | missing the key fact |
| `containsAll` | does every required fact appear? | half answers ("a deposit is required", but how much?) |
| `citations` | are the citations valid (lesson 04, post 07)? | missing or invented `[n]` |

Each returns `true`, `false`, or **`null` when it doesn't apply** (no `expectedSource` on a refusal case, no facts to look for). `null` is not a pass and not a fail; the harness (post 06) leaves it out of the averages.

### Retrieval first

`hit3` is the cheapest and most useful check: if the right document never reached the model, nothing downstream can save the answer. When an answer is wrong, check retrieval first.

### Whole words, case-insensitive

A naive `text.includes('no')` matches *"noon"* and *"notify"*. `containsWord` matches whole words only, with Unicode-aware boundaries, so `13:00` and `in-person` still work.

### The blind spot

Code checks look at **words**, not **meaning**. *"Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse"* contains `12` and `charge nurse`, cites `[1]`, and retrieved the right document. Every check passes. The answer is wrong.

---

## Let's see it in code

Open [`checks.ts`](./checks.ts) (the checks the harness uses) and [`example.ts`](./example.ts) (runs them on hand-written answers).

> **Course helpers:** this example imports `section` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `section()` prints a bold heading in the console output. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### Whole-word matching

```ts
export function containsWord(text: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}
export const containsAny = (text: string, needles: string[]) => needles.some((n) => containsWord(text, n));
export const containsAll = (text: string, needles: string[]) => needles.every((n) => containsWord(text, n));
```

The needle is escaped (so `1+1` is literal), and must be surrounded by a non-letter, non-digit, or the start/end of the text.

### What the app returned

```ts
export interface AppResult {
  answer: string;
  answerable: boolean;
  citationsValid: boolean;
  sources: string[]; // retrieved sources, best first
}
```

The harness builds this from lesson 04's `retrieve` + `answer`.

### All five checks

```ts
export function codeChecks(c: EvalCase, r: AppResult) {
  return {
    hit3: c.expectedSource ? r.sources.slice(0, 3).includes(c.expectedSource) : null, // retrieval
    refusalOk: r.answerable === c.answerable, // answered when it should, refused when it should
    contains: c.answerable && c.mustContain?.length ? containsAny(r.answer, c.mustContain) : null,
    containsAll: c.answerable && c.mustContainAll?.length ? containsAll(r.answer, c.mustContainAll) : null,
    citations: c.answerable ? r.citationsValid : null,
  };
}
```

### Hand-written answers to score

```ts
label: 'forgot the amount',
id: 'noshow-deposit',
result: { ...ok, answer: 'After three no-shows a deposit is required [1].', sources: ['appointment-cancellation.md'] },
```

```ts
label: 'meaning flipped (from lesson 04, post 08)',
id: 'icu-children',
result: { ...ok, answer: 'Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse [1].', sources: ['visiting-hours.md'] },
```

### Show the case next to the checks

```ts
dump(`golden case ${id}`, byId(id));
```

`dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) prints each golden case once, before its answers. Read it next to the printed `codeChecks` result (one line of JSON, the function's whole return value): every check reads one field of the case. `contains` uses `mustContain`, `containsAll` uses `mustContainAll`, `hit3` uses `expectedSource`. A field the case doesn't have makes its check `null` ("doesn't apply"), which is not the same as `true`.

---

## Run it

From the lesson folder (no model needed):

```bash
npm run post:03
# or: npx tsx 03-code-checks/example.ts
```

### What you should see

```
── Whole words only ──
containsAny("Leave by noon", ["no"]) → false
containsAny("No, it is not allowed", ["no"]) → true

── noshow-deposit: correct ──
▼ golden case noshow-deposit
{
  id: 'noshow-deposit',
  question: 'After how many no-shows is a deposit required, and how much is it?',
  answerable: true,
  mustContain: [ 'three', '3' ],
  mustContainAll: [ '100' ],
  expectedSource: 'appointment-cancellation.md',
  reference: 'After three no-shows within 12 months a SAR 100 deposit is required for each new booking.'
}
  "After three no-shows in 12 months a SAR 100 deposit is required [1]."
  {"hit3":true,"refusalOk":true,"contains":true,"containsAll":true,"citations":true}

── noshow-deposit: forgot the amount ──
  "After three no-shows a deposit is required [1]."
  {"hit3":true,"refusalOk":true,"contains":true,"containsAll":false,"citations":true}

── parking: invented a fee ──
▼ golden case parking
{
  id: 'parking',
  question: 'How much does hospital parking cost per hour?',
  answerable: false
}
  "Parking costs SAR 5 per hour [2]."
  {"hit3":null,"refusalOk":false,"contains":null,"containsAll":null,"citations":null}
…
── discharge-time: wrong retrieval ──
▼ golden case discharge-time
{
  id: 'discharge-time',
  …
  mustContain: [ '13:00', '1 pm', '1pm' ],
  expectedSource: 'discharge.md',
  reference: 'Patients should leave the room by 13:00.'
}
  "By 13:00 [1]."
  {"hit3":false,"refusalOk":true,"contains":true,"containsAll":null,"citations":true}

── icu-children: meaning flipped (from lesson 04, post 08) ──
▼ golden case icu-children
{
  id: 'icu-children',
  question: 'Can a 9 year old visit their grandfather in the ICU?',
  answerable: true,
  mustContainAll: [ '12', 'charge nurse' ],
  expectedSource: 'visiting-hours.md',
  reference: 'Children under 12 may not visit the ICU unless the charge nurse approves.'
}
  "Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse [1]."
  {"hit3":true,"refusalOk":true,"contains":null,"containsAll":true,"citations":true}
```

Three bugs caught, each by a different check. The last answer is wrong and passes everything: its case only asks for the words `12` and `charge nurse`, and the flipped answer has both.

The `parking` case has no `expectedSource` and no facts, so every check except `refusalOk` is `null`. For a must-refuse case, refusing is the whole test.

This isn't hypothetical. On a real run with `qwen3:0.6b` (post 06), the app said *"Yes, a first visit with a new specialist can be done by telehealth. First visits with a new specialist must be in person…"*, contradicting itself, and `contains: ['in person']` passed.

## Common gotchas

- ❌ **Substring matching.** `includes('no')` matches "noon". Use whole words.
- ❌ **Counting `null` as a fail (or a pass).** Checks that don't apply must stay out of the average.
- ❌ **Treating a green code check as "correct".** It only means the words are there. Pair with a judge (post 04).
- ❌ **Checking the answer before retrieval.** If `hit3` is false, fix retrieval first.
- ✅ Keep code checks pure functions with no I/O: they're unit-testable and run anywhere.

## Try it yourself

1. Add a `noNegationFlip` check for `icu-children`: fail if the answer starts with "Yes". Does it catch the flipped answer? Write an answer that is still wrong but passes it. (This is why you need meaning, not words.)
2. Add a `maxWords` check (e.g. fail answers over 80 words). Which real cases from post 06's run would fail it?
3. Add `hit1` next to `hit3`. When would you care about it?

## Key takeaways

- Code checks are **free, fast and deterministic**: run them first and on every change.
- Five that cover most regressions: **hit@3, refusal, any-of facts, all-of facts, citations**.
- Return **`null`** when a check doesn't apply, and leave it out of the averages.
- They check **words, not meaning**: a fluent wrong answer can pass them all.

---

[← Previous: A golden dataset](../02-golden-dataset/README.md) · [📚 Series index](../README.md) · [Next: An LLM judge for faithfulness →](../04-llm-judge-faithfulness/README.md)
