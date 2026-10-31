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

```ts
  const parts = r.steps.flatMap((s) => s.content.filter((p) => p.type.startsWith('tool-')));
  if (showParts) dump('tool and approval parts from every step', parts);
  else console.log('  tool and approval parts in steps:', parts.length);
  dump('finishReason', r.finishReason);
```

The printed lines are a summary; `dump()` ([what it is](../../shared/README.md#dumplabel-value--print-the-full-returned-value)) shows the parts themselves, but only for A1 and A2: those are the two shapes (decided by the policy, waiting for a human). The other calls just log how many parts there were. The ordinary `tool-call` and `tool-result` parts are explained in [lesson 01, post 08](../../01-foundations-structured-output/08-tool-calling/README.md), and the `invalid: true` shape in [post 03](../03-tool-argument-checks/README.md#step-3--watch-the-events).

| Part | Fields to look at |
|---|---|
| `tool-call` | `toolCallId`, `toolName`, `input`: what the model asked for. |
| `tool-approval-request` | `approvalId` (the key you answer with) and the `toolCall` it is about. `isAutomatic: true` when the policy function decided by itself. |
| `tool-approval-response` | The same `approvalId`, `approved: true` or `false`, and the policy's `reason` when it denied. |
| `tool-result` | Only for approved calls: `execute` ran and this is its `output`. |

`finishReason` tells you whether the loop finished (`'stop'`) or stopped at a call that still needs a person (`'tool-calls'`).

### Step 3 — the pause

```ts
const first = await ask(model, history, true);
console.log('  executed so far:', ran.length ? ran : 'nothing — no cancellation yet ✅');
```

The third argument (`showParts`) dumps the tool and approval parts in full only for A1 and A2. `generateText` returned, but the cancellation did not run.

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

```ts
dump('history sent to resume', history);
```

The dump shows the whole resume protocol: the user message, the assistant message with the `tool-call` and its `tool-approval-request`, and our `tool` message with a `tool-approval-response` for the same `approvalId`. Nothing else is needed.

```ts
  if (messages.at(-1)?.role === 'tool') {
    dump('initialResponseMessages', (r as typeof r & { initialResponseMessages: typeof r.responseMessages }).initialResponseMessages);
  }
```

On the resume, the log says `tool and approval parts in steps: 0`: the approved tool ran **before** the first model step, so it is in no step. Instead of dumping the whole result (its fields are in [lesson 01, post 00](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned)), the example dumps just `initialResponseMessages`, where its output went: a `tool` message with the `tool-result`. The AI SDK exposes that field at runtime; TypeScript's `GenerateTextResult` type does not, so the example reads it through a small cast.

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
- **A3**: the model's sentence and `executed: [ 'cancelAppointment APT-7' ]`. No `result` line is printed, because the approved tool's result is in `initialResponseMessages`, not in `steps` (see the `initialResponseMessages` dump below).
- **B**: the small test model called `cancelAppointment` and the loop stopped for approval; nothing executed.

Trimmed with "…" (ids, timestamps and timings differ on every run; parts A1–A3 use a scripted model, B used `qwen3:0.6b`):

```
── [A1] Own patient → approved; other patient → denied ──
  call     readRecord({"patientId":"P-001"})
  policy   approved
  result   {"patientId":"P-001","dx":"hypertension"}
  call     readRecord({"patientId":"P-002"})
  policy   denied: P-002 is not in your care team
▼ tool and approval parts from every step
[
  {
    type: 'tool-call',
    toolCallId: 'call-0',
    toolName: 'readRecord',
    input: { patientId: 'P-001' }
  },
  {
    type: 'tool-approval-request',
    approvalId: 'aitxt-…',
    toolCall: { … },
    isAutomatic: true
  },
  {
    type: 'tool-approval-response',
    approvalId: 'aitxt-…',
    toolCall: { … },
    approved: true
  },
  {
    type: 'tool-result',
    toolCallId: 'call-0',
    toolName: 'readRecord',
    input: { patientId: 'P-001' },
    output: { patientId: 'P-001', dx: 'hypertension' },
    dynamic: false
  },
  …
  {
    type: 'tool-approval-response',
    approvalId: 'aitxt-…',
    toolCall: {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'readRecord',
      input: { patientId: 'P-002' }
    },
    approved: false,
    reason: 'P-002 is not in your care team'
  }
]
▼ finishReason
'stop'
  model said: P-001 has hypertension. I cannot open P-002.

── [A2] Cancel → the loop STOPS and waits for a human ──
  call     cancelAppointment({"appointmentId":"APT-7"})
  ⏸ waiting for a human (approvalId aitxt-…)
▼ tool and approval parts from every step
[
  {
    type: 'tool-call',
    toolCallId: 'call-0',
    toolName: 'cancelAppointment',
    input: { appointmentId: 'APT-7' }
  },
  {
    type: 'tool-approval-request',
    approvalId: 'aitxt-…',
    toolCall: {
      type: 'tool-call',
      toolCallId: 'call-0',
      toolName: 'cancelAppointment',
      input: { appointmentId: 'APT-7' }
    }
  }
]
▼ finishReason
'tool-calls'
  model said: (nothing yet — waiting for approval)
  executed so far: nothing — no cancellation yet ✅

── [A3] The human approves → resume with their answer ──
▼ history sent to resume
[
  { role: 'user', content: 'Cancel appointment APT-7' },
  {
    role: 'assistant',
    content: [
      { type: 'tool-call', … },
      {
        type: 'tool-approval-request',
        approvalId: 'aitxt-…',
        toolCallId: 'call-0'
      }
    ]
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId: 'aitxt-…',
        approved: true
      }
    ]
  }
]
  tool and approval parts in steps: 0
▼ finishReason
'stop'
▼ initialResponseMessages
[
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call-0',
        toolName: 'cancelAppointment',
        output: { type: 'json', value: { appointmentId: 'APT-7', status: 'cancelled' } }
      }
    ]
  }
]
  model said: APT-7 is cancelled.
  executed: [ 'cancelAppointment APT-7' ]

── [B] Your CHAT_MODEL asked to cancel (it must stop for approval) ──
  call     cancelAppointment({"appointmentId":"APT-9"})
  ⏸ waiting for a human (approvalId aitxt-…)
  tool and approval parts in steps: 2
▼ finishReason
'tool-calls'
  model said: (nothing yet — waiting for approval)
  executed: nothing — waiting for a human
```

Compare A1 and A2: the policy's own decisions come with `isAutomatic: true` and a response in the same step; the cancellation's request has neither, and `finishReason` is `'tool-calls'`. In A3's resume, the tool's output is wrapped as `{ type: 'json', value: … }`: that is how a tool result is stored in a message.

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
