# Post 04 · Prompting: system, user and assistant roles

*Series: [Lesson 01 — Foundations](../README.md) · Post 4 of 8 · about 40 minutes*

> You ask the model *"Is this urgent? My father has crushing chest pain."* It replies with a warm, careful paragraph: *"I'm so sorry to hear that. Chest pain can have many causes, and it's important to…"*
>
> Lovely for a human. Useless for your code, which needs to route the message to the emergency queue **right now**. What you wanted was one word: `URGENT`.

In [post 03](../03-model-calls-and-streaming/README.md) you learned *how* to call a model. This post is about *what you say* to it, so that the answer is the same, checkable kind of thing every time.

---

## The idea, in plain English

### A prompt is a list of messages with roles

A **prompt** is everything you send to the model to tell it what to do. In chat models, the prompt is a list of **messages**, and each message has a **role**:

| Role | Who writes it | What it is for |
|---|---|---|
| **system** | You, the developer | Standing rules for the whole conversation: who the model is, the task, the limits, the output format. The end user normally never sees it. In the AI SDK it goes in the `instructions` option. |
| **user** | The end user (or your code acting for them) | The actual question or input. |
| **assistant** | The model | Its earlier replies. You can also write assistant messages yourself, to show examples. |

### The five parts of a good system prompt

1. **Role**: "You are a triage assistant for a hospital patient portal."
2. **Task**: "Sort each message into exactly one category."
3. **Definitions**: what each category or term means. Never assume the model shares your meaning.
4. **Rules for grey areas**: "If unsure between URGENT and ROUTINE, choose URGENT."
5. **Output format**: "Reply with the category word only." Make it something your **code** can check.

### Zero-shot vs. few-shot

- *Zero-shot* = instructions only.
- *Few-shot* = instructions **plus a few worked examples**, written as user → assistant pairs before the real input. Examples are often the strongest signal you can give: the model copies their style and format.

### How it works

```
messages sent to the model, in order:

 system    │ You are a triage assistant…  Categories: URGENT = …  If unsure…  Reply with one word.
 user      │ I fainted twice this morning and feel dizzy          ┐
 assistant │ URGENT                                               │ few-shot examples
 user      │ Please update my phone number on file                │ (written by you)
 assistant │ ADMIN                                                ┘
 user      │ My father has crushing chest pain and is sweating…   ← the real input
                                   │
                                   ▼
 model continues the pattern  →  "URGENT"
```

The model is a "continue the text" machine ([post 01](../01-llm-and-tokens/README.md)). Your instructions and examples make the answer you want the **most likely continuation**.

### Why it matters

- In a backend, the model's answer is **input to your code**: an `if`, a database column, a routing decision. A friendly paragraph cannot be routed. One word, `URGENT`, can.
- A vague prompt gives answers that change format from run to run. That is impossible to test and dangerous in healthcare.
- The grey-zone rule is where your **domain knowledge** goes. A clinician would say "when in doubt, escalate", so you write that down for the model.
- The system prompt is also where you set limits ("never give dosing amounts"). It is not a security wall, though: lesson 06 covers guardrails.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It runs the **same task with two prompts**, a vague one and a good one, so you can see the difference side by side.

### Step 1 — test cases with the right answer

```ts
const inbox = [
  { text: 'My father has crushing chest pain and is sweating a lot right now', expected: 'URGENT' },
  { text: 'Can I get a copy of my last invoice for insurance?', expected: 'ADMIN' },
  { text: 'My knee still aches a bit after physio, should I book a follow-up?', expected: 'ROUTINE' },
];
```

Each input comes with the label a nurse would give it. Writing down `expected` from day one is a good habit: it turns "looks fine to me" into something you can check.

### Step 2 — the vague prompt

```ts
const vague = (text: string) => ({ messages: [{ role: 'user', content: `Is this urgent? ${text}` } as ModelMessage] });
```

One line, no definitions, no format. This is what most people write first.

### Step 3 — the good system prompt, part by part

```ts
const SYSTEM = [
  'You are a triage assistant for a hospital patient portal.', // ROLE: who the model is
  'Sort each patient message into exactly one category.', // TASK: what to do
  'Categories: URGENT = possible emergency symptoms; ROUTINE = clinical but not an emergency; ADMIN = billing, records, scheduling paperwork.', // DEFINITIONS
  'If unsure between URGENT and ROUTINE, choose URGENT.', // RULE: what to do in the grey zone
  'Reply with the category word only, nothing else.', // OUTPUT FORMAT: easy for code to read
].join('\n');
```

Each line maps to one of the five parts above; the comments name them. Writing it as an array keeps each part on its own line, which also makes prompt diffs easy to review in a PR.

### Step 4 — few-shot examples

```ts
const EXAMPLES: ModelMessage[] = [
  { role: 'user', content: 'I fainted twice this morning and feel dizzy' },
  { role: 'assistant', content: 'URGENT' },
  { role: 'user', content: 'Please update my phone number on file' },
  { role: 'assistant', content: 'ADMIN' },
];
```

You write these assistant replies yourself. To the model they look like answers it already gave, so it continues in the same one-word style.

### Step 5 — put it together with `instructions`

```ts
const good = (text: string) => ({
  instructions: SYSTEM, // standing instructions (same for every message)
  messages: [
    ...EXAMPLES, // examples (same for every message)
    { role: 'user', content: text } as ModelMessage, // the real input (changes every time)
  ],
});
```

The split matters: rules go in `instructions` (the AI SDK sends them as the system message), and examples plus the real input go in `messages`. Only the last message changes per request.

The file prints the object `good()` returns, using the toolkit's `dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)):

```ts
dump('good(inbox[0].text) — the options we pass to generateText', shown);
```

It's a plain options object with two fields. `instructions` is one string (the five lines joined with `\n`). `messages` holds only `user` and `assistant` turns: the two few-shot pairs, then the real input. There is no `system` entry in the array; the SDK adds it from `instructions` when it sends the request.

### Step 6 — run both on the same inputs

```ts
for (const item of inbox) {
  const run = async (p: { instructions?: string; messages: ModelMessage[] }) =>
    stripThinking((await generateText({ model: chatModel(), ...p, temperature: 0, maxOutputTokens: 400 })).text)
      .replace(/\s+/g, ' ')
      .slice(0, 90);
  console.log(`\nMessage:  "${item.text}"   (expected ${item.expected})`);
  console.log(`  vague → ${await run(vague(item.text))}`);
  console.log(`  good  → ${await run(good(item.text))}`);
}
```

Same model, same `temperature: 0`, same input. The only variable is the prompt. (The output is cut to 90 characters so the vague answers fit on one line.)

### Step 7 — two fields of the result for the good prompt

```ts
// One more call for the good prompt on the first message, to look at two fields of the result.
// (We do not dump the whole generateText() result again: post 00 already showed it in full.)
// `text` is a single word, and `usage.inputTokens` is much larger than for a one-line prompt:
// the system prompt and the few-shot examples are re-sent (and paid for) on every call.
const full = await generateText({ model: chatModel(), ...good(inbox[0]!.text), temperature: 0, maxOutputTokens: 400 });
console.log('\nGood prompt, first message — text:', full.text);
console.log('usage:', { inputTokens: full.usage.inputTokens, outputTokens: full.usage.outputTokens });
```

One more call, so you can see two fields for the good prompt. `text` is a single word, `'URGENT'`, so your code can compare it directly. `usage.inputTokens` is about 148, against roughly 20–30 for a one-line prompt: the system prompt and the few-shot examples are sent, and paid for, **on every call**. That is the price of a good prompt, and usually worth it. We saw the full `generateText()` result in [post 00](../00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned).

---

## Run it

From the lesson folder:

```bash
npm run post:04:offline   # prints the good prompt exactly as the model receives it
npm run post:04           # runs vague vs. good prompt on 3 messages (calls your CHAT_MODEL)
# or: npx tsx 04-prompting/example.ts [--offline]
```

### What you should see

- **Part A** shows the messages in order: system, two few-shot pairs, then the real user message.
- **Part B**, for each of the three inbox messages:
  - **vague** gives a long, chatty paragraph (cut short in the printout);
  - **good** gives exactly `URGENT`, `ADMIN` or `ROUTINE`, which your code can use directly.
- After the loop, the `text` and a small `usage` object for the good prompt on the first message.
- Small models sometimes label the knee message `URGENT` instead of `ROUTINE`. The format is still clean (one word), and the grey-zone rule pushed it towards caution. Whether that is acceptable is a question for evals (lesson 05).

A real run with a small `qwen3:0.6b` (trimmed at `…`):

```
── [A] The good prompt, as the list of messages the model receives
system   | You are a triage assistant for a hospital patient portal.
         | Sort each patient message into exactly one category.
         | …
user     | I fainted twice this morning and feel dizzy
assistant| URGENT
user     | Please update my phone number on file
assistant| ADMIN
user     | My father has crushing chest pain and is sweating a lot right now
▼ good(inbox[0].text) — the options we pass to generateText
{
  instructions: 'You are a triage assistant for a hospital patient portal.\n' +
    'Sort each patient message into exactly one category.\n' +
    …
    'Reply with the category word only, nothing else.',
  messages: [
    { role: 'user', content: 'I fainted twice this morning and feel dizzy' },
    { role: 'assistant', content: 'URGENT' },
    { role: 'user', content: 'Please update my phone number on file' },
    { role: 'assistant', content: 'ADMIN' },
    {
      role: 'user',
      content: 'My father has crushing chest pain and is sweating a lot right now'
    }
  ]
}

── [B] Vague vs. good prompt on the same three messages ────────

Message:  "My father has crushing chest pain and is sweating a lot right now"   (expected URGENT)
  vague → It's important to consult a healthcare professional immediately. Chest pain can be a sign
  good  → URGENT

Message:  "Can I get a copy of my last invoice for insurance?"   (expected ADMIN)
  vague → You're asking for a copy of your last insurance invoice. This is a general request, and it
  good  → ADMIN

Message:  "My knee still aches a bit after physio, should I book a follow-up?"   (expected ROUTINE)
  vague → It depends on several factors, so I'll break down your thoughts: 1. **If the pain is mild
  good  → URGENT

Good prompt, first message — text: URGENT
usage: { inputTokens: 148, outputTokens: 4 }
```

The vague answers, ids and exact token counts will differ on your machine; the one-word answers from the good prompt should not (apart from the knee message, as noted above).

## Common gotchas

- ❌ **"Is this urgent?" with no definition.** The model will chat instead of classify.
- ❌ **Examples that are all the same category.** The model learns "always say X".
- ❌ **Asking for a format in words only** ("answer in JSON") when you need guaranteed structure. Use structured output instead ([post 07](../07-structured-output/README.md)).
- ❌ **Treating the prompt as finished after one good run.** Prompts are code: version them and test them.
- ✅ Add 2–5 short, **varied** examples. Cover each category, including a tricky one.
- ✅ Keep standing rules in `instructions` and per-request data in the user message.

## Try it yourself

1. Add a fourth inbox message that sits in the grey zone, such as *"I have a mild headache since yesterday, is that ok?"*. Does the grey-zone rule change the result?
2. Remove the few-shot `EXAMPLES` and run again. Does the format stay as clean?
3. Write a small loop that counts how many of the messages match `expected`. That is your first "eval".

## Key takeaways

- Three roles: **system** (your rules, via `instructions`), **user** (the input), **assistant** (replies, or your examples).
- A good system prompt = role + task + definitions + grey-zone rule + output format.
- Few-shot examples are often the strongest signal you can give.
- Design the output for **your code**, not for a human reader.

---

[← Previous: Calling a model with the AI SDK](../03-model-calls-and-streaming/README.md) · [📚 Series index](../README.md) · [Next: Context engineering →](../05-context-engineering/README.md)
