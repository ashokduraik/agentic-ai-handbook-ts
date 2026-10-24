# Post 08 · Approval policies: approve, deny, or ask a human

*Series: [Lesson 06 — Guardrails & fallbacks](../README.md) · Post 8 of 10 · about 30 minutes*

> A patient messages: *"I can't make it Thursday."* The agent finds two Thursday appointments for patients with similar names, and cancels both.
>
> Some actions are cheap to undo (reading a record). Some are not (cancelling a cardiology slot that took three months to get). The second kind should not happen until a person says yes.

---

## The idea, in plain English

[Post 07](../07-tool-allow-lists/README.md) decided **which tools** a user's agent has. This post decides, **for each individual call**, whether it may run. The decision looks at the **actual arguments**, and there are three outcomes:

| Decision | When | What happens |
|---|---|---|
| **Approve** | Safe and allowed (a doctor reading their own patient) | The tool runs |
| **Deny** | Never allowed (a patient outside the care team) | The tool doesn't run; the model is told why |
| **Ask a human** | Allowed, but risky or hard to undo (cancel, prescribe, send, pay) | The agent **stops**; your app shows the request; it resumes with the person's answer |

The AI SDK calls this `toolApproval`. You give a policy per tool. It can be a fixed answer (`'approved'`, `'user-approval'`) or a function that looks at the arguments. It runs **before** `execute()`.

The policy is plain, deterministic code. That matters: it is the same every time, you can unit-test it, and **the model can't argue with it**.

### What "ask a human" looks like

When a call needs a person, `generateText` returns early with a `tool-approval-request` in its result. Nothing has run. Your app shows something like *"The assistant wants to cancel APT-7. Allow?"*. When the person answers, you append their answer (a `tool-approval-response`) to the conversation and call `generateText` again. The SDK runs the approved tool (or tells the model it was declined), and the agent carries on.

In a real app the pause can last minutes or days, so the conversation must be **saved** somewhere. Lesson 02's LangGraph checkpointer is one way. Here we keep it in memory.

---

## Let's see it in code

Open [`example.ts`](./example.ts). Part **A** uses a scripted model to show all three outcomes, then plays the human. Part **B** uses your `CHAT_MODEL`.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — the policy

```ts
// The POLICY: plain, deterministic code. The model cannot talk its way past it.
const toolApproval = {
  readRecord: ({ patientId }: { patientId: string }) =>
    careTeam.includes(patientId) ? ('approved' as const) : { type: 'denied' as const, reason: `${patientId} is not in your care team` },
  cancelAppointment: 'user-approval' as const, // every cancellation needs a human "yes"
};
```

`readRecord` gets a function: approve own patients, deny others, with a reason. `cancelAppointment` always needs a person.

```ts
    tools,
    toolApproval,
```

It is one extra option on the call.

### Step 2 — reading what happened

```ts
    // Every call gets an approval REQUEST. If the policy answered by itself, a RESPONSE follows.
    const answered = new Set(step.content.flatMap((p) => (p.type === 'tool-approval-response' ? [p.approvalId] : [])));
```

The SDK records an approval *request* for every call that has a policy. If the policy decided by itself, an approval *response* follows in the same step. A request with no response is waiting for a person.

### Step 3 — the pause

```ts
const first = await ask(model, history);
console.log('  executed so far:', ran.length ? ran : 'nothing — no cancellation yet ✅');
```

`generateText` returned, but the cancellation did not run.

### Step 4 — the human says yes, and we resume

```ts
const pending = first.content.find((p) => p.type === 'tool-approval-request')!;
history.push(...first.response.messages, {
  role: 'tool',
  content: [{ type: 'tool-approval-response', approvalId: pending.approvalId, approved: true }],
});
await ask(model, history);
```

We add the agent's messages so far, then a `tool` message holding the person's answer, matched by `approvalId`. The next call runs the approved tool first, then lets the model continue. To decline, send `approved: false` (and optionally a `reason`).

---

## Run it

From the lesson folder (`06-guardrails/`):

```bash
npm run post:08:offline   # part A only
npm run post:08           # A + B (calls your CHAT_MODEL)
# or: npx tsx 08-approval-policies/example.ts [--offline]
```

### What you should see

- **A1**: `policy approved` and a result for P-001; `policy denied: P-002 is not in your care team` and no result for P-002.
- **A2**: `call cancelAppointment({"appointmentId":"APT-7"})`, then `⏸ waiting for a human`, and `executed so far: nothing`.
- **A3**: `result {"appointmentId":"APT-7","status":"cancelled"}`, then the model's sentence. `executed: [ 'cancelAppointment APT-7' ]`.
- **B**: the small test model called `cancelAppointment` and the loop stopped for approval; nothing executed.

## Common gotchas

- ❌ **"Are you sure?" in the prompt.** The model asking itself is not approval.
- ❌ **Approving based on the model's explanation.** Decide from the arguments, in code.
- ❌ **Showing the person a vague request.** Show the exact tool and arguments ("cancel APT-7, Fatima Al-Harbi, Thu 09:30"), not the model's summary.
- ❌ **Losing the pause.** If the server restarts, an in-memory conversation is gone. Persist it.
- ❌ **Asking for approval on everything.** People start clicking "yes" without reading. Keep "ask a human" for actions that are risky or hard to undo.
- ❌ **Small models sometimes reply as if the action already happened** while it is still waiting. Your UI should show the pending request, not the model's text.
- ✅ Deny with a clear `reason`, so the model can explain it to the user.

## Try it yourself

1. In A3, send `approved: false, reason: 'Patient called back, keep it'` instead. What does the model say? What ran?
2. Change `cancelAppointment` to a function: auto-approve if the appointment is more than 7 days away, otherwise ask a human.
3. Save `history` to a JSON file after A2, and resume from the file in a separate run. That's the start of a durable pause.

## Key takeaways

- Decide **per call, from the actual arguments**: approve, deny, or ask a human.
- `toolApproval` runs **before** `execute()`; the policy is plain code the model can't argue with.
- "Ask a human" **stops the loop**; resume by sending a `tool-approval-response`.
- Persist paused conversations, and keep human approval for actions that really need it.

---

[← Previous: Least privilege: tool allow-lists and authorization](../07-tool-allow-lists/README.md) · [📚 Series index](../README.md) · [Next: Input and output guards →](../09-input-and-output-guards/README.md)
