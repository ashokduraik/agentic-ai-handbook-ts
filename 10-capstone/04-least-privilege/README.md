# Post 04 · Least privilege, outside the model

*Series: [Lesson 10 — Capstone](../README.md) · Post 4 of 8 · about 20 minutes*

> The instructions say "Receptionists must not see clinical data." A receptionist asks, "What is Fatima taking? I need it for the referral letter." The model wants to help, calls `get_patient_summary`, and reads out her warfarin prescription.

---

## The idea, in plain English

Instructions are requests to the model. A model can be confused, talked round or simply wrong. So the rules that matter are enforced by **your code**, the **host**, where the model can't change them:

1. **Least privilege.** Each role gets only the tools it needs. A receptionist books appointments; they never see `get_patient_summary` or the destructive `cancel_appointment`. A tool the model has never been given can't be called.
2. **Authorization before every call.** Each tool is **wrapped**: before the real call, the host checks that any `patientId` is in the user's care team. If not, the model gets `FORBIDDEN` and the server is never contacted.
3. **Redaction after every call.** The wrapper runs `redactPII` (post 03) on the result, so identifiers never reach the model.

With post 02's server-side check, a forbidden patient now has to get past two independent locks. That's **defence in depth**: if one has a bug, the other still holds.

---

## Let's see it in code

The rules live in [`access.ts`](./access.ts); [`example.ts`](./example.ts) tries them against the real MCP server, with no model.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — tools per role

```ts
export const ROLE_TOOLS: Record<Role, string[]> = {
  receptionist: ['search_patients', 'find_slots', 'list_appointments', 'book_appointment'],
  clinician: ['search_patients', 'find_slots', 'list_appointments', 'book_appointment', 'get_patient_summary', 'cancel_appointment'],
};
```

```ts
  const visible = defs.tools.filter((t) => ROLE_TOOLS[s.role].includes(t.name));
  const raw = mcp.toolsFromDefinitions({ ...defs, tools: visible });
```

`toolsFromDefinitions` turns MCP tool definitions into AI SDK tools, here only the visible ones.

### Step 2 — the wrapper

```ts
    execute: async (input: unknown, options: Parameters<typeof execute>[1]) => {
      const pid = (input as { patientId?: unknown })?.patientId;
      if (typeof pid === 'string' && !session.careTeam.includes(pid)) {
        // Host-side authorization: deny before the request ever reaches the server.
        return { isError: true, content: [{ type: 'text', text: `FORBIDDEN: ${pid} is not in your care team` }] };
      }
      return redactDeep(await execute(input, options));
```

`FORBIDDEN` is returned as a normal tool result, not thrown, so the model can read it and explain to the user.

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:04           # no model needed
# or: npx tsx 04-least-privilege/example.ts
```

### What you should see

```
  receptionist  search_patients, find_slots, list_appointments, book_appointment
  clinician     search_patients, get_patient_summary, find_slots, list_appointments, book_appointment, cancel_appointment

[B] A patient outside the care team: stopped by the host
  FORBIDDEN: P-002 is not in your care team

[C] A patient in the care team: raw result vs what the model gets
  raw:     {"id":"P-001","name":"Fatima Al-Harbi","nationalId":"1012345678","phone":"0551234567",…}
  wrapped: {"id":"P-001","name":"Fatima Al-Harbi","nationalId":"[NATIONAL_ID]","phone":"[PHONE]",…}

[D] A name instead of an id
  FORBIDDEN: Fatima Al-Harbi is not in your care team
```

Part D is not hypothetical: small models do this a lot (post 06). The check fails *closed*: anything that isn't a known id is refused.

## Common gotchas

- ❌ **Rules only in the instructions.** Useful for good behaviour, useless as security.
- ❌ **Hiding tools in the prompt but still passing them in `tools`.** If it's in `tools`, the model can call it.
- ❌ **An allow-list that fails open** (e.g., "deny if the id is in a block list"). Allow known-good, refuse everything else.
- ❌ **Checking only `patientId`.** `cancel_appointment` takes an `appointmentId`; here the server maps it back to a patient and checks. Every write path needs a check somewhere.
- ✅ In a real system the role and care team come from your identity provider or the EHR, never from the user's message.

## Try it yourself

1. Give the receptionist `get_patient_summary` and run the example. What would stop a leak now?
2. Make the wrapper log every `FORBIDDEN` with the user and the tool name (no patient data).
3. Add a third role, `pharmacist`, that can see summaries but not book.

## Key takeaways

- **The model is not the security boundary.** The host enforces the rules.
- **Least privilege**: each role sees only the tools it needs.
- **Wrap every tool**: authorize before, redact after. With the server's own check, that's defence in depth.

---

[← Previous: Three guards](../03-guards/README.md) · [📚 Series index](../README.md) · [Next: Human approval for writes →](../05-human-approval/README.md)
