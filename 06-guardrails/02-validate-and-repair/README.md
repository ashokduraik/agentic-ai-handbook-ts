# Post 02 · Validate every answer, and repair instead of failing

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 2 of 10 · about 30 minutes*

> The assistant turns a doctor's dictation into a prescription record. The JSON is perfect: every field present, every type correct. It says paracetamol, 2000 mg, four times a day. That is 8 g a day, twice the safe maximum.
>
> A schema check passed. The patient would not have. This post adds the second layer of checks, and what to do when the model can't get it right.

In lesson 01 you used `Output.object` to get JSON that matches a Zod schema. That checks the **shape**. This post adds **business rules**, a **repair loop**, and the most important habit in this lesson: **failing closed**.

---

## The idea, in plain English

### Two layers of validation

1. **Shape.** Is it the right structure? Is `doseMg` a positive number? Is `startDate` formatted `YYYY-MM-DD`? A Zod schema handles this, and the SDK sends it to the model as JSON Schema so the model knows what to produce.
2. **Business rules.** Does it make sense in *your* world? Is the start date in the past? Is the total daily dose safe? JSON Schema can't express these, so you check them in your own code after parsing. Zod's `.refine()` is a tidy way to write them.

### Repair: tell the model what was wrong

When a check fails, you don't have to give up at once. Send the model its previous answer **and the exact error message**, and ask again. Models are often good at fixing a specific, clearly described mistake. Give it a small, fixed number of attempts (usually 2–3), because each one costs time and money.

### Fail closed

If every attempt fails, return a **clear failure** that the caller must handle, such as "send to a pharmacist". Never pass along "the best of the bad answers". This is called **failing closed**: when unsure, the system does the safe thing (nothing, or a human) rather than the risky thing.

Also notice what the repair message says: *"never invent a safer dose"*. If the dictation really says 8 g a day, the right outcome is a human review, not a model quietly changing the dose to something that passes the check.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** runs the checks with no model. Part **B** adds the repair loop with your `CHAT_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`) and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — layer 1: the shape

```ts
const Prescription = z.object({
  drug: z.string().min(2),
  doseMg: z.number().positive(),
  timesPerDay: z.int().min(1).max(6),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

This schema is what the model sees. Keep it to things JSON Schema can express: types, ranges, formats.

### Step 2 — layer 2: business rules

```ts
const SafePrescription = Prescription.refine((p) => p.startDate >= today, {
  message: `startDate must be today (${today}) or later`,
  path: ['startDate'],
}).refine((p) => !(p.drug.toLowerCase() === 'paracetamol' && p.doseMg * p.timesPerDay > 4000), {
  message: 'paracetamol total daily dose must not exceed 4000 mg',
  path: ['doseMg'],
});
```

Each `.refine()` is one rule with a human-readable message. Those messages matter twice: they appear in your logs, and they are what the model reads during repair.

```ts
const r = SafePrescription.safeParse(tooMuch);
console.log('tooMuch →', r.success ? 'valid' : 'invalid\n' + z.prettifyError(r.error));
```

`safeParse` never throws; it returns `{ success, data | error }`. `z.prettifyError` turns the error into readable text.

```ts
if (!r.success) for (const i of r.error.issues) console.log(`  issue: code=${i.code} path=${i.path.join('.')}`);
```

The full `safeParse` result (`success: false` and a `ZodError` with an `issues` list) is shown in [lesson 01, post 07](../../01-foundations-structured-output/07-structured-output/README.md), so we only log each issue's `code` (`'custom'` for a `.refine()`) and `path` (the field to blame: the `path: ['doseMg']` we gave the rule). The `message` is the text we gave the rule. On success you would get `success: true` and `data` instead.

### Step 3 — the repair loop

```ts
async function extractWithRepair(text: string, maxAttempts = 3) {
  let feedback = ''; // what went wrong last time, in words the model can act on
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
```

`feedback` starts empty. After a failure it holds the previous answer and the error, and it is appended to the next prompt.

```ts
      const { output } = await generateText({
        model: chatModel(),
        temperature: 0,
        output: Output.object({ schema: Prescription }), // layer 1 is enforced by the SDK
        instructions: `Today is ${today}. Extract the prescription. Use ISO dates.`,
        prompt: `Prescription: "${text}"${feedback}`,
      });
      // The parsed structured output of this attempt (the shape is in lesson 01, post 07). It already
      // matches the SHAPE (layer 1, checked by the SDK); whether it is SAFE is decided on the next line.
      console.log(`  attempt ${attempt}: model answered`, JSON.stringify(output));
      const checked = SafePrescription.safeParse(output); // layer 2 is enforced by us
      if (checked.success) return { ok: true as const, value: checked.data, attempts: attempt };
```

The SDK enforces the shape (it throws `NoObjectGeneratedError` if the model's JSON doesn't fit). The log line shows each attempt's `output`, already a typed object of the right shape (more about `Output.object` in [lesson 01, post 07](../../01-foundations-structured-output/07-structured-output/README.md)). We then check the business rules ourselves. Note that we tell the model today's date: models don't know it.

```ts
      feedback = `\n\nYour previous answer ${JSON.stringify(output)} broke these rules:\n${z.prettifyError(checked.error)}\nFix it if the text allows; never invent a safer dose.`;
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) throw e; // network/auth errors are not ours to repair
      // Why the SDK gave up (the full error is in lesson 01, post 07). `text` is what the model actually
      // wrote: that is what we quote back to the model.
      console.log(`  attempt ${attempt}: NoObjectGeneratedError, model wrote`, e.text);
      feedback = `\n\nYour previous answer ${e.text ?? ''} was not valid JSON for the schema. Return only valid JSON.`;
    }
```

Two kinds of failure, two kinds of feedback. When the shape is wrong, the SDK throws `NoObjectGeneratedError` (its full shape, with `cause`, `usage` and `finishReason`, is in [lesson 01, post 07](../../01-foundations-structured-output/07-structured-output/README.md)). Here we only log `e.text`, the model's raw reply, because that is what we quote back. In our runs the model always produced the right shape, so a scripted mock model that wrote `"doseMg":"2000 mg"` and no `startDate` would log (the text is the `text` field of the error captured from such a mock run):

```
  attempt 1: NoObjectGeneratedError, model wrote {"drug":"Paracetamol","doseMg":"2000 mg","timesPerDay":4}
```

A failed attempt still costs tokens: it carries `usage`. Any **other** error (network down, wrong API key) is re-thrown: asking the model again won't fix those. That is posts 04–06.

### Step 4 — fail closed

```ts
  // FAIL CLOSED: never pass an unsafe value downstream. The caller must handle this branch.
  return { ok: false as const, reason: 'could not produce a valid, safe prescription — send to a pharmacist', attempts: maxAttempts };
```

```ts
dump('extractWithRepair() result', await extractWithRepair('Amoxicillin 500 mg three times a day starting 2026-10-25'));
```

The example `dump()`s ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) this helper's return value, once for a success and once for a failure: it is our own type, not an SDK one. The return type is a **union**: `{ ok: true, value }` or `{ ok: false, reason }`. TypeScript forces the caller to check `ok` before touching `value`, so nobody can forget the failure branch.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:02:offline   # part A only
npm run post:02           # part A + B (calls your CHAT_MODEL)
# or: npx tsx 02-validate-and-repair/example.ts [--offline]
```

### What you should see

- **Part A**: `ok → valid`, then `tooMuch → invalid` with the message *paracetamol total daily dose must not exceed 4000 mg*.
- **Part B1**: `ok: true`. With the small test model the `drug` field was the whole phrase ("Amoxicillin 500 mg three times a day") instead of just "Amoxicillin". It passed, because our schema only says "at least 2 characters". That is a hint to tighten it (see Try it yourself).
- **Part B2**: three failed attempts, then `ok: false … send to a pharmacist`. With the small model, "from tomorrow" also became a wrong date (today's date in one run, a date two days in the past in another), which broke the date rule as well. Either way, nothing unsafe got out.

Part A and B with `qwen3:0.6b` (dates and the model's choices differ between runs):

```
── [A] Shape + business rules, no model ──
ok      → valid
tooMuch → invalid
✖ paracetamol total daily dose must not exceed 4000 mg
  → at doseMg
  issue: code=custom path=doseMg

── [B1] A normal prescription ──
  attempt 1: model answered {"drug":"Amoxicillin 500 mg three times a day","doseMg":500,"timesPerDay":3,"startDate":"2026-10-25"}
▼ extractWithRepair() result
{
  ok: true,
  value: {
    drug: 'Amoxicillin 500 mg three times a day',
    doseMg: 500,
    timesPerDay: 3,
    startDate: '2026-10-25'
  },
  attempts: 1
}

── [B2] An unsafe prescription → repair attempts, then fail closed ──
  attempt 1: model answered {"drug":"Paracetamol","doseMg":2000,"timesPerDay":4,"startDate":"2026-10-22"}
  attempt 1 failed → asking again with feedback:   Your previous answer {"drug":"Paracetamol","doseMg":2000,"timesPerDay":4,"startDate":"2026-10-22"} broke these rules: ✖ paracetamol total …
  attempt 2: model answered {"drug":"Paracetamol","doseMg":2000,"timesPerDay":4,"startDate":"2026-10-22"}
…
▼ extractWithRepair() result
{
  ok: false,
  reason: 'could not produce a valid, safe prescription — send to a pharmacist',
  attempts: 3
}
```

The "model answered" lines show the repair loop's real limit: all three attempts are **identical**. The feedback reached the model, and at `temperature: 0` it gave the same answer again. That is the right outcome here (the text really says 2000 mg four times a day, and we told it never to invent a safer dose), but it also shows that repair only helps when the model *can* fix its answer. The `ok: false` result has no `value` field at all, so there is nothing unsafe to pass on by mistake.

## Common gotchas

- ❌ **Trusting JSON because it parsed.** Valid shape is not valid meaning.
- ❌ **Putting business rules in the prompt only.** "Max 4 g a day" in the instructions is a hint; `.refine()` is a check.
- ❌ **Repairing forever.** Cap attempts. Every retry costs time and money.
- ❌ **Letting repair "fix" the facts.** If the source text is unsafe, the correct output is a failure, not a model-invented safer dose.
- ❌ **Small models extract loosely** (whole phrases in a `drug` field, wrong relative dates). Your schema and rules have to catch it.
- ✅ Return a typed success/failure union so callers must handle failure.

## Try it yourself

1. Change `drug` to `z.enum(['amoxicillin', 'paracetamol', 'amlodipine'])`. What happens to B1 now?
2. Add a rule: `timesPerDay` must be 1 for `amlodipine`. Write a test case for Part A that breaks it.
3. Set `maxAttempts` to 1 and run B2. How much faster is it? When would you choose that?

## Key takeaways

- Validate in **two layers**: the shape (schema, sent to the model) and business rules (your code).
- On failure, **repair**: send the exact error back, a few times at most.
- Then **fail closed** with a typed result the caller must handle.
- Never let the model "fix" an unsafe input into a different, invented value.

---

[← Previous: What can go wrong: prompt injection and the OWASP Top 10](../01-threats-and-owasp/README.md) · [📚 Series index](../README.md) · [Next: Check the model's tool arguments →](../03-tool-argument-checks/README.md)
