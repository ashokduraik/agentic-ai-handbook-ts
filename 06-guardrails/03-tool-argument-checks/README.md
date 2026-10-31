# Post 03 · Check the model's tool arguments

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 3 of 10 · about 25 minutes*

> A pharmacist asks the assistant to "refill Fatima's amlodipine for a year". The model calls your refill API with `patientId: "Fatima Al-Harbi"` and `days: 365`. The API looks up a patient named "Fatima Al-Harbi", finds two, and refills the wrong one.
>
> The model wasn't malicious. It just filled in the arguments as best it could. This post makes sure bad arguments never reach your code.

In lesson 01 you gave the model tools. When a model calls a tool, its **arguments are model output**, exactly like the JSON in [post 02](../02-validate-and-repair/README.md). They need the same treatment.

---

## The idea, in plain English

### The input schema is a contract

Every AI SDK `tool()` has an `inputSchema`. It does two jobs:

1. It is sent to the model, so the model knows what arguments to produce.
2. The SDK **validates the model's arguments against it before `execute()` runs**.

So make the schema **as strict as the real API behind the tool**. Not `patientId: z.string()`, but "a string that looks like `P-001`". Not `days: z.number()`, but "a whole number from 7 to 90". Not `drug: z.string()`, but "one of the three drugs this clinic refills".

### What happens when the arguments are wrong

When validation fails, the SDK **doesn't run your code**. It records a `tool-error` with the validation message and, if the loop has more steps, sends that error back to the model. The model reads *"patientId must look like P-001 (use the id, not the name)"* and usually tries again with better arguments.

This is the same repair idea as post 02, built into the tool loop for free. Your job is to write good error messages.

### Validation is not authorization

A perfectly valid `patientId: "P-002"` can still be a patient this user must not see. Shape checks answer *"is this well-formed?"*. Authorization answers *"is this caller allowed?"*. That is [post 07](../07-tool-allow-lists/README.md).

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** uses a **scripted fake model** (from `support/mock-models.ts`) that sends a bad call and then a good one, so you can see exactly what happens without depending on a real model's mood. Part **B** uses your `CHAT_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — a strict contract

```ts
const refillPrescription = tool({
  description: 'Request a refill of an existing prescription for a patient. Patient ids look like P-001.',
  inputSchema: z.object({
    patientId: z.string().regex(/^P-\d{3}$/, 'patientId must look like P-001 (use the id, not the name)'),
    drug: z.enum(['amlodipine', 'metformin', 'atorvastatin']), // only drugs this clinic refills
    days: z.int().min(7).max(90), // no 1000-day refills
  }),
```

Three different kinds of rule: a **format** (regex with a helpful message), a **closed list** (enum), and a **range**. The regex message is written for the model to read.

```ts
  execute: async ({ patientId, drug, days }) => {
    executed.push(`${patientId}/${drug}/${days}`);
    return { status: 'queued', patientId, drug, days };
  },
```

`execute` records every call that really reached our code. If the guard works, the bad call never appears here.

### Step 2 — the scripted model

```ts
  scriptedModel(
    { toolName: 'refillPrescription', input: { patientId: 'Fatima Al-Harbi', drug: 'amlodipine', days: 365 } }, // ✗ name, ✗ days
    { toolName: 'refillPrescription', input: { patientId: 'P-001', drug: 'amlodipine', days: 30 } }, // ✓
    { text: 'Refill for amlodipine (30 days) is queued.' },
  ),
```

The fake model plays three steps: a bad call (a name instead of an id, and 365 days), a corrected call, and a final sentence. A scripted model is a great way to **test your guards deterministically**.

### Step 3 — watch the events

```ts
  for (const step of result.steps)
    for (const part of step.content) {
      if (part.type === 'tool-error') console.log('  ❌ tool-error  ', JSON.stringify(part.input), '→', String(part.error).split('\n')[0]!.slice(0, 90));
      if (part.type === 'tool-result') console.log('  ✅ tool-result ', JSON.stringify(part.input), '→', JSON.stringify(part.output));
    }
```

Each step's `content` lists what happened. A `tool-error` part means the arguments were rejected (or `execute` threw). A `tool-result` part means `execute` ran and returned.

```ts
dump('tool parts from every step', result.steps.flatMap((s) => s.content.filter((p) => p.type.startsWith('tool-'))));
```

The two lines above show a summary; `dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) prints every tool part of every step in full. For a rejected call you get **two** parts:

| Part | Fields to look at |
|---|---|
| `tool-call` with `invalid: true` | `input`: the arguments exactly as the model sent them. `error`: an `InvalidToolInputError` whose innermost `cause` is the `ZodError`, with one issue per bad field (`path`, `message`: our "use the id, not the name" text). |
| `tool-error` | The same `toolCallId` and `input`, and `error` as **text**. This text is what the SDK sends back to the model, so it is the model's only clue for fixing its call. |
| `tool-result` (for a valid call) | `input` after validation, and `output`: what `execute` returned. |

There is no `tool-result` for `call-0`: execute() never saw the bad arguments.

This is the first time this lesson prints tool parts, so we print them in full. The ordinary `tool-call` and `tool-result` objects are explained in [lesson 01, post 08](../../01-foundations-structured-output/08-tool-calling/README.md); what is new here is the `invalid: true` call and the `tool-error` part. Later posts ([07](../07-tool-allow-lists/README.md), [08](../08-approval-policies/README.md)) only log the parts they care about.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:03:offline   # part A only
npm run post:03           # part A + B (calls your CHAT_MODEL)
# or: npx tsx 03-tool-argument-checks/example.ts [--offline]
```

### What you should see

- **Part A**: one `❌ tool-error` for the name/365-day call (an `AI_InvalidToolInputError`), then one `✅ tool-result` for `P-001/amlodipine/30`. The line `execute() really ran for:` lists **only** the good call.
Part A's dump, trimmed with "…" (always the same: the model is scripted):

```
▼ tool parts from every step
[
  {
    type: 'tool-call',
    toolCallId: 'call-0',
    toolName: 'refillPrescription',
    input: { patientId: 'Fatima Al-Harbi', drug: 'amlodipine', days: 365 },
    dynamic: true,
    invalid: true,
    error: InvalidToolInputError {
      name: 'AI_InvalidToolInputError',
      message: 'Invalid input for tool refillPrescription: AI_TypeValidationError: Type validation failed: Value: {"patientId":"Fatima Al-Harbi","drug":"amlodipine","days":365}. … [+434 chars, the details are in cause]',
      cause: TypeValidationError {
        name: 'AI_TypeValidationError',
        message: 'Type validation failed: Value: {"patientId":"Fatima Al-Harbi","drug":"amlodipine","days":365}. … [+434 chars, the details are in cause]',
        cause: ZodError {
          name: 'ZodError',
          issues: [
            {
              origin: 'string',
              code: 'invalid_format',
              format: 'regex',
              pattern: '/^P-\\d{3}$/',
              path: [ 'patientId' ],
              message: 'patientId must look like P-001 (use the id, not the name)'
            },
            {
              origin: 'number',
              code: 'too_big',
              maximum: 90,
              inclusive: true,
              path: [ 'days' ],
              message: 'Too big: expected number to be <=90'
            }
          ]
        },
        value: { patientId: 'Fatima Al-Harbi', drug: 'amlodipine', days: 365 }
      },
      toolInput: '{"patientId":"Fatima Al-Harbi","drug":"amlodipine","days":365}',
      toolName: 'refillPrescription'
    }
  },
  {
    type: 'tool-error',
    toolCallId: 'call-0',
    toolName: 'refillPrescription',
    input: { patientId: 'Fatima Al-Harbi', drug: 'amlodipine', days: 365 },
    error: 'AI_InvalidToolInputError: Invalid input for tool refillPrescription: AI_TypeValidationError: Type validation failed: Value: {"patientId":"Fatima Al-Harbi","drug":"amlodipine","days":365}.\n' +
      'Error message: [\n' +
      …
    dynamic: true
  },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'refillPrescription',
    input: { patientId: 'P-001', drug: 'amlodipine', days: 30 }
  },
  {
    type: 'tool-result',
    toolCallId: 'call-1',
    toolName: 'refillPrescription',
    input: { patientId: 'P-001', drug: 'amlodipine', days: 30 },
    output: { status: 'queued', patientId: 'P-001', drug: 'amlodipine', days: 30 },
    dynamic: false
  }
]
  (hidden for readability: [].error.cause.cause.stack, [].error.cause.stack, [].error.stack — set SHOW_RAW=1 to print everything)
```

The `tool-error` text is long (it is the whole Zod issue list as JSON), and that is good: the model reads both of our messages and can fix both fields at once.

- **Part B**: with the small test model the call went through correctly (`P-001`, 30 days), but its final sentence said "30 days remaining", which is not what the tool returned. Argument checks protect your API, not the wording of the answer. In a later run the dump held just one `tool-call` (id `call_ntblhwzq`, with `P-001`, 30 days) and its `tool-result`, and the final sentence was fine.

## Common gotchas

- ❌ **`z.string()` for ids.** The model will happily pass names, emails or `"the patient"`.
- ❌ **Unhelpful error messages.** "Invalid string" teaches the model nothing; "use the id, not the name" does.
- ❌ **No step budget left for the retry.** With `stopWhen: stepCountIs(1)` the model never gets to fix its arguments.
- ❌ **Thinking validation = permission.** A well-formed id can still be the wrong patient (post 07).
- ❌ **Small models still word the result loosely** even when the call is right. Show users the tool result, not just the model's summary.
- ✅ Make the schema as strict as the API behind it, and test it with a scripted model.

## Try it yourself

1. Remove the custom regex message and run Part A. Compare the tool-error text.
2. Add `reason: z.string().max(200)` to the schema. Script a call with a 1,000-character reason.
3. Script a model that keeps sending bad arguments three times. What does `result.text` contain at the end? How would you fail closed?

## Key takeaways

- Tool arguments are model output. **Validate them before your code runs.**
- The `inputSchema` is both the instructions to the model and the guard; make it strict.
- Rejected calls become `tool-error`s, and the model gets a chance to repair.
- Validation checks **shape**, not **permission**.

---

[← Previous: Validate every answer, and repair instead of failing](../02-validate-and-repair/README.md) · [📚 Series index](../README.md) · [Next: Timeouts and retries →](../04-timeouts-and-retries/README.md)
