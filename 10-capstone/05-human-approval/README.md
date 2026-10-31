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

### Step 5 — look at the approval decision

The full `generateText()` result was dumped in [lesson 01, post 00](../../01-foundations-structured-output/00-course-toolkit/README.md#step-4--look-at-everything-the-call-returned) (tool calls in [post 08](../../01-foundations-structured-output/08-tool-calling/README.md)), so this demo does not dump it again. It dumps only the one new part: the `tool-approval-response` in `content`, in run [A]. Everything else is a summary line: each call, each approval decision, the answer text and the store. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
    // The full generateText() result shape is in lesson 01, posts 00 and 08; tool-approval-response was dumped in
    // lesson 06, post 08. Only that part is dumped here, and only in [A]: Notice approved: false and your `reason`,
    // and that the booking never produced a tool-result. [B]'s approved booking is shown by the summary lines and the store below.
    if (!approveWrites) dump('generateText() result: the tool-approval-response part of content', r.content.find((p) => p.type === 'tool-approval-response'));
```

```ts
    // The store's truth, whatever the answer text claimed (the result is a normal MCP tool result: post 02).
    console.log('  store:   ', (booked as { content: { text: string }[] }).content[0]!.text);
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

Offline (`approvalId` is a new random id each run):

```
── [A] Without approval · scripted model ──
▼ generateText() result: the tool-approval-response part of content
{
  type: 'tool-approval-response',
  approvalId: 'aitxt-a5b1vIyOxdr48zWfT4azProy',
  toolCall: {
    type: 'tool-call',
    toolCallId: 'call-2',
    toolName: 'book_appointment',
    input: { patientId: 'P-001', slotId: 'S-1', reason: 'BP follow-up' },
    toolMetadata: {
      clientName: 'ai-sdk-mcp-client',
      toolName: 'book_appointment',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
    },
    dynamic: true
  },
  approved: false,
  reason: 'needs human approval'
}
  call      search_patients
  call      find_slots
  call      book_appointment
  approval  book_appointment: denied (needs human approval)
  answer:   Done.
  store:    []

── [B] With approval · scripted model ──
  call      search_patients
  call      find_slots
  call      book_appointment
  approval  book_appointment: approved
  answer:   Done.
  store:    [{"resourceType":"Appointment","id":"APT-1","status":"booked","slot":[{"reference":"Slot/S-1"}],"participant":[{"actor":{"reference":"Patient/P-001"},"status":"accepted"}],"description":"BP follow-up","start":"2026-10-25T09:00:00+03:00"}]
```

What to notice:

| Field | What it tells you |
|---|---|
| `approved` / `reason` | The answer your `toolApproval` policy gave: `approved: false` with your `reason` in [A]. In [A] there is no `tool-result` for the booking: the server was never called. |
| `toolCall.toolMetadata.annotations` | The MCP annotations travel with every call; `readOnlyHint: false` is why the booking needed approval. |
| `approvalId` | A new random id each run. |
| `approval  book_appointment: …` | The summary line for every run: denied in [A], approved in [B]. |
| `store:` | The store's answer: `[]` in [A], the Appointment in [B]. |

The scripted model says "Done." both times. Only the store tells you which run really booked.

Live (`qwen3.8:latest`), the model called `search_patients`, `find_slots`, then `book_appointment` in both runs. Run A was denied (the part dumped has `approved: false`), and the answer said human approval was needed. Run B was approved and booked (answers trimmed to the first 160 characters, as the code does):

```
── [A] Without approval · ollama:qwen3.8:latest ──
  call      search_patients
  call      find_slots
  call      book_appointment
  approval  book_appointment: denied (needs human approval)
  answer:   The booking requires human approval, so please review and approve it to confirm Fatima Al-Harbi's earliest cardiology slot (S-1, 2026-10-25 09:00 with Dr. Salem
  store:    []

── [B] With approval · ollama:qwen3.8:latest ──
  call      search_patients
  call      find_slots
  call      book_appointment
  approval  book_appointment: approved
  answer:   Fatima Al-Harbi (P-001) is booked for the earliest cardiology slot on 2026-10-25 at 09:00 (+03:00) with Dr. Salem for a blood-pressure follow-up (APT-1).
  store:    [{"resourceType":"Appointment","id":"APT-1","status":"booked","slot":[{"reference":"Slot/S-1"}],"participant":[{"actor":{"reference":"Patient/P-001"},"status":"accepted"}],"description":"blood-pressure follow-up","start":"2026-10-25T09:00:00+03:00"}]
```

Small models behave differently. In an earlier run on `qwen3:0.6b`, the model skipped `search_patients` and `find_slots` and called `book_appointment` straight away, in both runs. Approval was given in run B, but the model passed a name (`'FATIMA AL-HARBI'`) as `patientId` and `null` as `slotId`, so the host refused the call with `FORBIDDEN: FATIMA AL-HARBI is not in your care team`. The answer still said the appointment "has been booked", while the store was `[]`: exactly the false claim this post warns about.

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
