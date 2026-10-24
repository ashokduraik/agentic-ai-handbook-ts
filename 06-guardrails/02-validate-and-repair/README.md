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
      const checked = SafePrescription.safeParse(output); // layer 2 is enforced by us
      if (checked.success) return { ok: true as const, value: checked.data, attempts: attempt };
```

The SDK enforces the shape (it throws `NoObjectGeneratedError` if the model's JSON doesn't fit). We then check the business rules ourselves. Note that we tell the model today's date: models don't know it.

```ts
      feedback = `\n\nYour previous answer ${JSON.stringify(output)} broke these rules:\n${z.prettifyError(checked.error)}\nFix it if the text allows; never invent a safer dose.`;
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) throw e; // network/auth errors are not ours to repair
      feedback = `\n\nYour previous answer ${e.text ?? ''} was not valid JSON for the schema. Return only valid JSON.`;
    }
```

Two kinds of failure, two kinds of feedback. Any **other** error (network down, wrong API key) is re-thrown: asking the model again won't fix those. That is posts 04–06.

### Step 4 — fail closed

```ts
  // FAIL CLOSED: never pass an unsafe value downstream. The caller must handle this branch.
  return { ok: false as const, reason: 'could not produce a valid, safe prescription — send to a pharmacist', attempts: maxAttempts };
```

The return type is a **union**: `{ ok: true, value }` or `{ ok: false, reason }`. TypeScript forces the caller to check `ok` before touching `value`, so nobody can forget the failure branch.

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
- **Part B2**: three failed attempts, then `ok: false … send to a pharmacist`. With the small model, "from tomorrow" also became today's date, which broke the date rule as well. Either way, nothing unsafe got out.

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
