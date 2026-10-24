# Post 02 · Tools in depth

*Series: [Lesson 03 — MCP](../README.md) · Post 2 of 7 · about 40 minutes*

> The scheduling agent booked slot S-1 for Fatima. A minute later, it tries to book S-1 for Rahul too.
>
> What should the server do? Crash? Throw? Return "OK"? And how does the agent learn that cancelling is dangerous, but searching is not?

Tools are the part of MCP you will use most. A good MCP tool tells the model **what it needs**, **what it returns**, **how it can fail**, and **how risky it is**. This post covers all four, with the clinic's real tools.

---

## The idea, in plain English

### 1. Input schema: the model's form to fill in

Every tool has an `inputSchema` (Zod in the SDK, JSON Schema on the wire). The model reads it, plus the `description` and each field's `.describe()` text, to decide how to call the tool. The **server validates** every call against it before your code runs.

### 2. Output schema: a typed result for code

By default a tool returns `content`: text for the model to read. If you also declare an **`outputSchema`**, the tool returns **`structuredContent`**, a JSON object the client checks against that schema. Now *code* (not just the model) can use the result safely, like a typed API response. Send both: `structuredContent` for code, a `content` text copy for the model and older clients.

### 3. Two kinds of failure

| | Business error | Invalid arguments |
|---|---|---|
| Example | "Slot S-1 is already taken" | `department: "dermatology"` (not in the enum) |
| Who catches it | your handler | the SDK, before your handler runs |
| What comes back | a result with `isError: true` and your message | an error result (`-32602 Input validation error`) |
| What the model should do | read it, try another slot | fix its arguments |

The important rule: **return business errors as results, don't throw.** A result with `isError: true` goes back to the model, which can correct itself. Neither kind is a successful call; your host should log both.

### 4. Annotations: hints about risk

`annotations` are metadata the host can read:

| Hint | Means |
|---|---|
| `readOnlyHint: true` | calling it changes nothing |
| `destructiveHint: true` | it may delete or overwrite something |
| `idempotentHint: true` | calling it twice has the same effect as once |
| `openWorldHint: true` | it talks to the outside world (web, email) |

A host can use them to hide tools, or to ask a human first (post 06, and lesson 02's approval step). But they are **hints written by the server**: only trust them for servers you trust, and never use them as your security control (post 07 does real authorization).

---

## Let's see it in code

Open [`example.ts`](./example.ts). The fake clinic backend (`patients`, `slots`, `book()`) lives in [`../05-stdio-server/appointment-store.ts`](../05-stdio-server/appointment-store.ts).

> **Course helpers:** this example imports `section` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `section()` prints a bold heading in the console output. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### Tool 1 — schema descriptions and a read-only hint

```ts
inputSchema: { query: z.string().min(2).describe('Part of the patient name') }, // .describe() text reaches the model
annotations: { readOnlyHint: true }, // "calling me changes nothing"
```

### Tool 2 — a typed result

```ts
outputSchema: { slots: z.array(z.object({ id: z.string(), doctor: z.string(), start: z.string() })) },
```

```ts
return {
  structuredContent: { slots: free }, // checked against outputSchema; code can use it directly
  content: [{ type: 'text', text: JSON.stringify(free) }], // text copy for the model and older clients
};
```

On the client, code reads the typed object directly, no text parsing:

```ts
const { slots: free } = found.structuredContent as { slots: { id: string; start: string }[] };
console.log('first free slot, read by CODE:', free[0]?.id, free[0]?.start);
```

### Tool 3 — a business error as a result

```ts
try {
  const appt = book(patientId, slotId, reason);
  return { content: [{ type: 'text', text: `Booked ${appt.id} (slot ${slotId}) for ${patientId}.` }] };
} catch (e) {
  // Don't throw: return the problem as a RESULT, so the model can read it and try another slot.
  return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
}
```

### Tool 4 — labelled destructive

```ts
annotations: { destructiveHint: true }, // a HINT for the host, not a security control
```

### The calls

```ts
const ok = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-001', slotId: 'S-1', reason: 'chest pain follow-up' } });
```

```ts
const taken = await client.callTool({ name: 'book_appointment', arguments: { patientId: 'P-002', slotId: 'S-1', reason: 'check-up' } });
```

```ts
const bad = await client.callTool({ name: 'search_slots', arguments: { department: 'dermatology' } });
```

A success, a double booking (business error), and an argument outside the enum (validation error).

---

## Run it

From the lesson folder:

```bash
npm run post:02
# or: npx tsx 02-tools/example.ts
```

### What you should see

First the full tool definition a model is shown for `book_appointment` (name, description, `inputSchema` as JSON Schema with `maxLength: 200`, annotations), then:

```
find_patient         annotations={"readOnlyHint":true}
search_slots         annotations={"readOnlyHint":true}
book_appointment     annotations={"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false}
cancel_appointment   annotations={"destructiveHint":true}

── A typed result: structuredContent ──
first free slot, read by CODE: S-1 2026-11-03T09:30

── Success, then a business error (isError) ──
book S-1 for P-001 → isError = false | Booked A-101 (slot S-1) for P-001.
book S-1 for P-002 → isError = true | Slot S-1 is already taken

── Invalid arguments: rejected by the schema, the handler never runs ──
isError = true | MCP error -32602: Input validation error: Invalid arguments for tool search_slots: Invalid option: expected one of "cardiology"|...
```

## Common gotchas

- ❌ **Throwing from a handler for a normal business failure.** Return `{ isError: true, content }` so the model can see the message and recover.
- ❌ **Vague descriptions** ("Books things"). The description and `.describe()` texts *are* the model's documentation. Say which ids it needs and where to get them.
- ❌ **Huge results.** Every byte of `content` goes into the model's context window. Return what the model needs, not the whole database row.
- ❌ **Using `destructiveHint` as access control.** Anyone can write any hint. Check permissions on the server (post 07).
- ✅ Return both `structuredContent` and a text `content` when you declare an `outputSchema`.

## Try it yourself

1. Change `search_slots` to return `structuredContent: { slots: 'none' }`. What does the client get? (The output schema is checked.)
2. Add an `idempotentHint: true` tool `confirm_appointment({ appointmentId })`. Why is it safe for a host to retry it automatically?
3. Rewrite `find_patient`'s description to be bad on purpose ("lookup"). In post 06, see whether the agent still finds the patient's id before booking.

## Key takeaways

- A tool = **name + description + input schema** (what the model reads) + a handler.
- **`outputSchema` + `structuredContent`** give code a typed result; keep a text `content` copy.
- **Business errors → `isError: true` results**; invalid arguments are rejected before your handler. Neither is a success.
- **Annotations** (`readOnlyHint`, `destructiveHint`, …) are hints a host may use, not security.

---

[← Previous: What is MCP?](../01-what-is-mcp/README.md) · [📚 Series index](../README.md) · [Next: Resources: context the app reads →](../03-resources/README.md)
