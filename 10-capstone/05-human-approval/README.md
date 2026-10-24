# Post 05 · Human approval for writes, and checking what really happened

*Series: [Lesson 10 — Capstone](../README.md) · Post 5 of 8 · about 20 minutes*

> The assistant books Fatima into a cardiology slot she didn't want, because the receptionist only asked what was available. Nobody approved it, and the slot is gone for another patient. When asked, the assistant says "Your appointment is confirmed" about a booking that never happened.

---

## The idea, in plain English

Reading data is easy to undo; **writing** isn't. So every tool that changes something needs a person's "yes" first. That's **human-in-the-loop** approval.

1. **Which tools write?** The MCP server's **annotations** say so (post 02). Anything not marked `readOnlyHint: true` counts as a write. Missing annotations are treated as writes: the safe default.
2. **The AI SDK checks approval for you.** `generateText` takes a `toolApproval` option: for each tool, `'approved'`, `{ type: 'denied', reason }`, or `'user-approval'` (pause and ask). A denied call never runs; the model gets the denial and the reason.
3. **Check the outcome, not the answer.** After the run, read the store (`list_appointments`). The model's words about what happened are not evidence.

In this capstone the "human" is a command-line flag, `--approve`, decided before the run. In a real app you'd return `'user-approval'`, show the pending request in the UI, and continue after someone clicks *Approve*; or use LangGraph's `interrupt()` (lesson 02) so the run can wait for days. That's week-11 exercise 1 on the [series index](../README.md).

---

## Let's see it in code

Open [`approval.ts`](./approval.ts) and [`example.ts`](./example.ts). The example runs the same booking twice: without and with approval.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `modelLabel()` gives a printable label such as `ollama:<model>`; `section()` prints a bold heading in the output; and `stripThinking()` removes the `<think>…</think>` part some models add to their answers. [More about these helpers](../../shared/README.md).

### Step 1 — write tools from annotations

```ts
export function writeToolsOf(tools: { name: string; annotations?: { readOnlyHint?: boolean } }[]): string[] {
  return tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
}
```

### Step 2 — the policy

```ts
    writeTools.map((n) => [n, approveWrites ? ('approved' as const) : { type: 'denied' as const, reason: 'needs human approval' }]),
```

### Step 3 — passing it to the tool loop

```ts
      toolApproval: approvalPolicy(writeToolsOf(visible), approveWrites),
```

### Step 4 — the truth is in the store

```ts
    const booked = await raw.list_appointments!.execute!({ patientId: 'P-001' }, { toolCallId: 'check', messages: [], context: {} });
```

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:05:offline   # a scripted model makes the tool calls
npm run post:05           # your CHAT_MODEL decides
# or: npx tsx 05-human-approval/example.ts
```

### What you should see

Offline:

```
[A] Without approval · scripted model
  call      search_patients
  call      find_slots
  call      book_appointment
  approval  book_appointment: denied (needs human approval)
  answer:   Done.
  store:    []

[B] With approval · scripted model
  …
  approval  book_appointment: approved
  answer:   Done.
  store:    [{"resourceType":"Appointment","id":"APT-1","status":"booked",…}]
```

The scripted model says "Done." both times. Only the store tells you which run really booked.

Live on the box (`qwen3:0.6b`), the small model skipped `search_patients` and `find_slots` and called `book_appointment` straight away. In run A it was denied, and the answer said approval was needed (correct). In run B it was approved, but the call failed (no real ids), and the answer said the booking **"is already confirmed"** while the store was empty: exactly the false claim this post warns about.

## Common gotchas

- ❌ **Believing the answer.** Check the store, as the evals in post 08 do.
- ❌ **Approving per session instead of per call.** "Yes to everything" turns the next mistake into a write. Approve the specific call, with its arguments shown.
- ❌ **Treating a missing annotation as read-only.** Unknown = write.
- ❌ **Asking for approval of things the user can't judge** ("approve `book_appointment` with `{"slotId":"S-1"}`?"). Show a human sentence: "Book Fatima Al-Harbi, cardiology, 25 Oct 09:00, Dr. Salem?"
- ✅ Approval decided *before* the run (this capstone) is simple and safe; it isn't a real pause. Know which one you've built.

## Try it yourself

1. Change the policy to a function `(input) => …` that approves bookings only for slots in the next 7 days.
2. Return `'user-approval'` instead of `'denied'` and print the `tool-approval-request` parts the run ends with.
3. Mark `book_appointment` as `readOnlyHint: true` in the server (just to see). Which line now books without asking? Change it back.

## Key takeaways

- **Write tools need a human "yes"**; find them from annotations, and treat unknown as write.
- The AI SDK's **`toolApproval`** stops denied calls before they run.
- **Check outcomes in the system of record**, never in the model's answer.

---

[← Previous: Least privilege, outside the model](../04-least-privilege/README.md) · [📚 Series index](../README.md) · [Next: The agent →](../06-the-agent/README.md)
