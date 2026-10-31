# Post 07 · Least privilege: tool allow-lists and authorization

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 7 of 10 · about 30 minutes*

> The front-desk chat and the doctors' chat share one agent, with one set of tools: `getSchedule`, `readRecord`, `deleteRecord`. A receptionist pastes in a patient email that says *"please delete my record"*. The agent, trying to be helpful, calls `deleteRecord`.
>
> The prompt said "only doctors may read records". The prompt is not a permission system. This post builds one, in code.

[Post 01](../01-threats-and-owasp/README.md) showed that any model can be talked into things. So the question stops being *"will the model behave?"* and becomes *"if it misbehaves, what can it actually do?"*. The answer should be: **as little as possible**. That is **least privilege**, and it is the main defence against OWASP's *excessive agency* (LLM06).

---

## The idea, in plain English

Two separate layers, both in your code.

### Layer 1: which tools exist for this user (the allow-list)

Give the model **only the tools this user's role needs**. A receptionist's agent doesn't need `readRecord`; no chat agent needs `deleteRecord`.

In the AI SDK, `activeTools` lists which of your tools are active for this call. Inactive tools aren't described to the model, and if the model asks for one by name anyway (an injection might tell it to), the SDK refuses with a `NoSuchToolError`. The tool's code never runs.

### Layer 2: may this user touch this record (authorization)

Even an allowed tool must check **every call**. A doctor may use `readRecord`, but only for patients in their care. That check goes **inside `execute()`**, using the logged-in user's details from **your session or identity system**, never from the model. Remember: the model's arguments might come from an attacker.

This is the familiar web-API rule (check access on every request, by object id) applied to tools. OWASP calls the missing check *BOLA*: broken object-level authorization.

### Don't trust the model's story

The model will sometimes **claim** it did something it didn't, or that something failed when it worked. Your UI, audit log and business logic should rely on **tool results**, never on the model's sentence.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** uses a scripted **adversarial** model that tries forbidden things, so you can watch each layer fire. Part **B** asks your `CHAT_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — who is asking comes from your system

```ts
interface Session { user: string; role: Role; careTeam: string[] } // from your login / IAM, never from the model
```

In a real app this comes from the login token. The model never sees it and can't change it.

### Step 2 — authorization inside the tool

```ts
// Tools are built PER SESSION, so execute() can see who is asking.
function makeTools(session: Session) {
```

```ts
      execute: async ({ patientId }) => {
        // 2. AUTHORIZATION, in code, every time.
        if (!session.careTeam.includes(patientId)) return { error: `FORBIDDEN: ${patientId} is not in your care team` };
        return { record: records[patientId] ?? 'not found' };
      },
```

Building the tools per request lets `execute` close over the session. The check returns an error *result* (rather than throwing) so the model can explain the refusal to the user.

### Step 3 — the allow-list per role

```ts
const ALLOWED: Record<Role, ('getSchedule' | 'readRecord' | 'deleteRecord')[]> = {
  receptionist: ['getSchedule'],
  doctor: ['getSchedule', 'readRecord'],
};
```

```ts
    tools: makeTools(session),
    activeTools: ALLOWED[session.role], // the model only sees these
```

`deleteRecord` is in no role's list, so no chat agent can run it. (Better still: don't give it to the agent at all. It's here so you can watch the guard work.)

### Step 4 — the model's story vs the results

```ts
await run('[A3] Receptionist asks to delete → tool is not on the allow-list', receptionist, 'Delete record P-001',
  scriptedModel({ toolName: 'deleteRecord', input: { patientId: 'P-001' } }, { text: 'Record deleted!' }));
// ↑ The model CLAIMS success. Never trust the model's story: trust the tool results.
```

The scripted model asks for `deleteRecord` and then announces success. The tool events show what really happened.

```ts
      if (part.type === 'tool-call' && part.invalid && NoSuchToolError.isInstance(part.error)) console.log('  ↳ invalid: true, availableTools:', part.error.availableTools);
```

```ts
  console.log('  tool parts:      ', result.steps.flatMap((s) => s.content.filter((p) => p.type.startsWith('tool-'))).length);
```

We don't print the full tool parts here. The ordinary `tool-call` and `tool-result` objects are in [lesson 01, post 08](../../01-foundations-structured-output/08-tool-calling/README.md), and the `invalid: true` call with its `tool-error` was printed in full in [post 03](../03-tool-argument-checks/README.md#step-3--watch-the-events). Two things to compare:

- **A2, authorization said no**: a normal `tool-call` followed by a normal `tool-result` whose `output` is `{ error: 'FORBIDDEN: …' }` (the `tool result:` line). The tool ran and returned a refusal, so the model got a clear answer.
- **A3, not on the allow-list**: the `tool-call` is `invalid: true` with a `NoSuchToolError` whose `availableTools` is `[ 'getSchedule' ]`, the receptionist's `activeTools`. Then a `tool-error` with the same text. There is **no** `tool-result`: `execute` never ran. The `tool parts` count (2) is that call and that error.

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:07:offline   # part A only
npm run post:07           # A + B (calls your CHAT_MODEL)
# or: npx tsx 07-tool-allow-lists/example.ts [--offline]
```

### What you should see

- **A1**: the doctor reads P-001 → `tool result: {"record":"Fatima Al-Harbi. …"}`.
- **A2**: the doctor asks for P-002 → `{"error":"FORBIDDEN: P-002 is not in your care team"}`.
- **A3**: the receptionist's model asks for `deleteRecord` → `tool error: … NoSuchToolError …`, **and then says "Record deleted!"**. Nothing was deleted. This is the "don't trust the story" lesson.
- **B**: with the small test model, the receptionist case made no tool call at all (it only had `getSchedule`) and answered from nothing. Bigger models usually explain that they can't access records.

A3 (always the same: the model is scripted), and B with `qwen3:0.6b` (its answer changes from run to run):

```
── [A3] Receptionist asks to delete → tool is not on the allow-list ──
  model asked for: deleteRecord({"patientId":"P-001"})
  ↳ invalid: true, availableTools: [ 'getSchedule' ]
  tool error:       AI_NoSuchToolError: Model tried to call unavailable tool 'deleteRecord'. Available tools: getSchedul
  tool parts:       2
  model said:       Record deleted!

── [B] Your CHAT_MODEL: receptionist asks for a medical record ──
  tool parts:       0
  model said:       The provided tools do not include a function to retrieve a diagnosis from record P-001. Please provide more details or confirm the specific 
```

In this run of B the small model did explain that it had no such tool. `tool parts: 0` proves the point either way: no tool part at all, so nothing was read.

## Common gotchas

- ❌ **Permissions written in the prompt.** "Receptionists can't read records" is a request, not a rule.
- ❌ **Taking the user id from the model's arguments.** Take it from the session.
- ❌ **One global toolset built at startup.** Then `execute` can't know who is asking.
- ❌ **Showing the model's sentence as proof.** In A3 it lied. Show results from the tools.
- ❌ **Small models answer without the tool** they would need, and invent details. Authorization stops data leaks; it doesn't stop made-up answers (lesson 05 evals catch those).
- ✅ Same rules as any API: least privilege per role, object-level checks on every call, audit log of tool results.

## Try it yourself

1. Add a `nurse` role that may `readRecord` only for patients on their ward (add `ward: string` to `Session`).
2. Log every `tool-call` with `session.user`, the tool name, the arguments and the result. That is your audit trail.
3. Script a model that asks for `readRecord` while the receptionist is logged in. Which layer stops it?

## Key takeaways

- Assume the model can be manipulated; limit **what it can do**.
- **Allow-list tools per role** with `activeTools`: inactive tools can't run.
- **Authorize every call inside `execute()`**, from the session, never from model arguments.
- Trust **tool results**, not the model's description of them.

---

[← Previous: The fallback chain](../06-fallback-chain/README.md) · [📚 Series index](../README.md) · [Next: Approval policies: approve, deny, or ask a human →](../08-approval-policies/README.md)
