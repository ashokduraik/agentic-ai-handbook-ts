# Post 02 · The MCP server: tools, annotations and a second lock on the door

*Series: [Lesson 10 — Capstone](../README.md) · Post 2 of 8 · about 25 minutes*

> The agent filters patients by care team. Then someone connects a different MCP client, Claude Desktop or a script, to the same server. That client doesn't have the filter, and it can read every patient in the hospital.

---

## The idea, in plain English

[Lesson 03](../../03-mcp/README.md) showed that **MCP** (Model Context Protocol) is a standard way for an app to offer tools and data to any AI host. Our server, [`fhir-mcp-server.ts`](./fhir-mcp-server.ts), offers the clinic data from post 01 as six **tools** and one **resource**:

| Tool | Does | Annotation |
|---|---|---|
| `search_patients` | Find the caller's patients by name; returns ids | read-only |
| `get_patient_summary` | Allergies and active medications for one patient | read-only |
| `find_slots` | Free slots for a specialty, earliest first | read-only |
| `list_appointments` | A patient's booked appointments | read-only |
| `book_appointment` | Book a free slot | write |
| `cancel_appointment` | Cancel a booking | write, **destructive** |

Three design choices are worth copying:

1. **Projections, not raw FHIR** (post 01). Raw resources are still there as a **resource**, `fhir://Patient/{id}`, for the host app to read. The model never calls resources.
2. **Annotations** (`readOnlyHint`, `destructiveHint`) tell hosts which tools change things. Post 05 uses them to decide what needs a human's approval.
3. **The server checks authorization itself.** The caller's care team arrives as a **claim**: an environment variable when the host starts the server as a child process (stdio), or an OAuth token over HTTP. The server refuses any patient outside it, whatever the host or model asked. That's **defence in depth**: post 04 adds a second check in the host, and either one alone would stop the leak.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It's an MCP host with no model: it lists the tools, calls a few, and reads a resource.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the claim

```ts
const careTeam = new Set((process.env.CALLER_CARE_TEAM ?? '').split(',').filter(Boolean));
```

### Step 2 — a tool with an annotation and a check

```ts
server.registerTool(
  'get_patient_summary',
  {
    description: 'Clinical summary for one patient: allergies and active medications.',
    inputSchema: { patientId: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ patientId }) => {
    if (!careTeam.has(patientId)) return forbidden(patientId);
```

`inputSchema` is zod: the SDK rejects malformed input before your code runs.

### Step 3 — a destructive tool

```ts
    annotations: { readOnlyHint: false, destructiveHint: true },
```

### Step 4 — starting and connecting

[`connect.ts`](./connect.ts) starts the server as a child process and passes the claim. Posts 04–08 all use it:

```ts
/** The care team travels to the server as a claim (an env var here; an OAuth token over HTTP). */
export function connectFhirServer(careTeam: string[]) {
  return createMCPClient({
    transport: new StdioClientTransport({
      command: process.execPath, // plain Node runs the TypeScript server directly (type stripping)
      args: [serverPath],
      env: { ...(process.env as Record<string, string>), CALLER_CARE_TEAM: careTeam.join(',') },
```

### Step 5 — look at what the server returns

This server speaks standard MCP, so the reply shapes are the ones lesson 03 already dumped in full: [`listTools()` and `callTool()`](../../03-mcp/01-what-is-mcp/README.md#step-4--look-at-what-each-call-returned) (see also [post 02, tools](../../03-mcp/02-tools/README.md)) and [`readResource()`](../../03-mcp/03-resources/README.md). So [`example.ts`](./example.ts) prints only the fields this post is about: the tool `name`s and their `annotations`, `isError` plus the text of each result, and a resource's `uri`, `mimeType` and start of its `text`.

```ts
  // Just the fields this post needs: each tool's `name` and `annotations` (readOnlyHint / destructiveHint),
  // which posts 04 and 05 rely on. The full listTools() shape (inputSchema and all) is in lesson 03, post 01.
```

```ts
  // A refusal is a normal result with `isError: true`, not a thrown error, so the model can read it.
  console.log(`  isError=${denied.isError}  ${textOf(denied)}`);
```

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:02           # no model needed
# or: npx tsx 02-the-mcp-server/example.ts
```

### What you should see

```
── [A] Tools and their annotations ──
  search_patients      read-only            Search the caller's patients by name. Returns patient ids for use with other tools.
  get_patient_summary  read-only            Clinical summary for one patient: allergies and active medications.
  find_slots           read-only            Free appointment slots for a specialty, earliest first.
  list_appointments    read-only            A patient's booked appointments.
  book_appointment     WRITE                Book a free slot for a patient. Requires ids from search_patients and find_slots.
  cancel_appointment   WRITE, destructive   Cancel a booked appointment.

── [B] search_patients({ name: "Fatima" }) ──
  isError=false  [{"id":"P-001","name":"Fatima Al-Harbi","birthYear":"1961"},{"id":"P-003","name":"Fatima Al-Qahtani","birthYear":"1990"}]

── [C] get_patient_summary for a patient outside the care team ──
  isError=true  FORBIDDEN: P-002 is not in the caller's care team

── [D] Resource fhir://Patient/P-003 ──
  fhir://Patient/P-003 (application/fhir+json)
  {"resourceType":"Patient","id":"P-003","identifier":[{"system":"urn:oid:sa-national-id","value":"1033344455"}],"name":[{ …
```

What the fields mean:

| Field | What it tells you |
|---|---|
| Tool kind (`read-only`, `WRITE`, `WRITE, destructive`) | Derived from the tool's `annotations` (`readOnlyHint` and `destructiveHint`): what post 05's approval rule reads to decide which tools are writes. |
| `isError` | `true` for the refusal. It is still a normal result, so the model can explain it. |
| Result text | A tool result is a list of parts; here one `text` part holds JSON (a projection: ids the model passes to the next tool). |
| Resource `uri` / `mimeType` | A resource is the raw FHIR JSON, national ID included: it is for the host app, not the model. |

Two patients called Fatima: a good reason for tools to return ids, not just names.

## Common gotchas

- ❌ **Logging to stdout in a stdio server.** stdout *is* the protocol channel; one stray `console.log` corrupts it. This server logs with `console.error`.
- ❌ **Trusting annotations from a server you don't control.** They're hints. Your host decides what needs approval.
- ❌ **Authorization only in the host.** Any other client gets everything. Check in the server too.
- ❌ **Errors as exceptions.** Return `isError: true` with a clear message, so the model can read it and tell the user.
- ✅ Tool descriptions are prompts: "Returns patient ids for use with other tools" teaches the model the order of calls.

## Try it yourself

1. Start the server with `CALLER_CARE_TEAM=P-001` only, and search for "Fatima" again.
2. Read `fhir://Patient/P-002`. What comes back, and why is that safer than an error message with details?
3. Add a read-only tool `list_allergies({ patientId })` with the care-team check, and list it in the example.

## Key takeaways

- The MCP server offers **projections as tools** and **raw data as resources**.
- **Annotations** mark read-only and destructive tools; hosts use them for approvals.
- The server enforces the **care-team claim** itself: defence in depth.

---

[← Previous: The FHIR-shaped data](../01-the-fhir-data/README.md) · [📚 Series index](../README.md) · [Next: Three guards →](../03-guards/README.md)
