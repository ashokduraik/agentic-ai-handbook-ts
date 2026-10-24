# Post 06 · The agent: posts 01–05 around one tool loop

*Series: [Lesson 10 — Capstone](../README.md) · Post 6 of 8 · about 25 minutes*

> You have a data store, an MCP server, guards, access rules and approvals. A receptionist still needs one thing: type a sentence, get it done safely. And you need to know it stays safe after every change, without running a model in CI.

---

## The idea, in plain English

[`agent.ts`](./agent.ts) exports `createAgent({ session, model?, approveWrites? })`. It connects the pieces in order:

1. Start the MCP server for this user's care team (post 02).
2. Keep only this role's tools, and wrap each one with authorization and redaction (post 04).
3. Work out the write tools and their approval policy (post 05).
4. For each question (`ask`): run the **input guard** (post 03); run the **tool loop**; turn the steps into a list of **tool events** (ok, error, denied); redact the answer and apply the **output guard**.

The tool loop is the AI SDK's `generateText` with `tools`: the model calls a tool, gets the result, decides the next call, and so on until it answers. It has **hard limits**, because a confused model can loop forever:

- `stopWhen: stepCountIs(8)`: at most 8 model calls.
- `maxOutputTokens: 1024` per call, and `timeout: { totalMs: 180_000 }` overall.
- `temperature: 0`, for the most repeatable tool choices.

The **instructions** still matter: they make good behaviour likely ("get ids from tools, never invent them"). Posts 03–05 make bad behaviour harmless.

`createAgent` takes an optional `model`. That's how the offline test works: a **scripted model** plays a fixed list of tool calls against the **real** MCP server, so CI checks the whole safety wiring without an LLM.

---

## Let's see it in code

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `chatModel()` returns the chat model named in your `.env` (`CHAT_MODEL`, on the provider in `AI_PROVIDER`); `stripThinking()` removes the `<think>…</think>` part some models add to their answers; `modelLabel()` gives a printable label such as `ollama:<model>`; and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the instructions

```ts
const INSTRUCTIONS = `You are a hospital scheduling assistant for clinic staff. Today is 2026-10-22 (Asia/Riyadh).
Rules:
- Always get ids from tools (search_patients, find_slots). Never invent ids. Call tools one at a time.
- If a tool result says FORBIDDEN or an action is denied, tell the user you cannot do it. Do not retry.
```

### Step 2 — assembling the tools

```ts
  const mcp = await connectFhirServer(session.careTeam);
  const defs = await mcp.listTools();
  const visible = defs.tools.filter((t) => ROLE_TOOLS[session.role].includes(t.name));
  const raw = mcp.toolsFromDefinitions({ ...defs, tools: visible });
  const tools: ToolSet = Object.fromEntries(Object.entries(raw).map(([n, t]) => [n, wrapTool(t, session)]));
  const writeTools = writeToolsOf(visible);
  const toolApproval = approvalPolicy(writeTools, !!opts.approveWrites);
```

### Step 3 — the guarded tool loop

```ts
        const gate = inputGuard(question);
        if (!gate.allowed) {
```

```ts
        const r = await generateText({
          model,
          instructions: INSTRUCTIONS,
          prompt: question,
          tools,
          toolApproval,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 1024,
          temperature: 0,
          timeout: { totalMs: 180_000 },
```

```ts
        let answer = redactPII(stripThinking(r.text));
        const og = outputGuard(answer);
```

### Step 4 — an offline check

```ts
    const a = await createAgent({ session: session('receptionist'), model: bookScript(), approveWrites: true });
    await a.ask('Book Fatima');
    assert.match(await a.callTool('list_appointments', { patientId: 'P-001' }), /APT-1/);
```

`callTool` calls a tool directly, without the model: the way tests and evals check the real outcome.

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:06:offline   # five end-to-end checks, scripted model + real MCP server
npm run ask               # the default booking request, no approval
npm run ask -- --approve "Book Fatima Al-Harbi the earliest cardiology slot for a blood-pressure follow-up"
npm run ask -- --role clinician "Look up the patient summary for Fatima Al-Harbi and tell me what she is allergic to"
npm run ask -- --role clinician "Show Rahul Menon's medications"
# or: npx tsx 06-the-agent/example.ts --role clinician "…"
```

### What you should see

Offline:

```
✅ receptionist sees 4 tools; booking denied without approval, nothing in the store
✅ approved booking is in the store (checked with a direct tool call)
✅ patient outside the care team blocked
✅ tool result redacted; dosing advice replaced with: "I can help with scheduling, but medication questions need a clinician or pharmacist."
✅ prompt injection blocked by the input guard
```

Live on the box (`qwen3:0.6b`), every safety rule held, and the small model struggled with the task:

- **No approval:** it called `book_appointment` with `patientId: "Fatima Al-Harbi"` straight away. Denied; the answer said approval was needed.
- **With `--approve`:** it passed the *tool names* as ids (`patientId: "search_patients"`, `slotId: "find_slots"`). The host answered `FORBIDDEN`, nothing was booked, and the answer said so.
- **Clinician, allergies:** `get_patient_summary("Fatima Al-Harbi")` → `FORBIDDEN`; then `search_patients` → `P-001`; then it stopped and answered *"she is allergic to allergies"*. Harmless, but wrong.
- **Rahul Menon:** `FORBIDDEN`, and the answer correctly said his medications can't be retrieved.

A larger tool-calling model follows the search → find → book order much more reliably. The point stands either way: a weak model made many mistakes, and none of them leaked data or booked anything.

## Common gotchas

- ❌ **No step limit.** A model that keeps retrying a `FORBIDDEN` call runs up your bill. `stepCountIs(8)` ends it.
- ❌ **Testing the agent only with a live model.** Slow and random. Script the model, keep the real server and wrappers.
- ❌ **One MCP server for all users.** The care-team claim is per user, so each agent starts its own server process here. Over HTTP you'd pass a per-request token instead.
- ❌ **Forgetting `close()`.** The MCP child process keeps running.
- ✅ Small models answer with names where ids belong; the host check turns that into a clean refusal.

## Try it yourself

1. Remove `wrapTool` (use `raw` directly) and run the offline checks. Which ones still pass, thanks to the server's own check?
2. Change `stepCountIs(8)` to `stepCountIs(2)` and run the approved booking live. What happens?
3. Add an offline check: a clinician cancels the booking made in check 2.

## Key takeaways

- `createAgent` = server + role tools + wrappers + approvals + guards + one bounded tool loop.
- **Hard limits** (steps, tokens, time) on every agent loop.
- A **scripted model + the real server** tests the safety wiring without an LLM.

---

[← Previous: Human approval for writes](../05-human-approval/README.md) · [📚 Series index](../README.md) · [Next: Tracing the agent →](../07-tracing-the-agent/README.md)
