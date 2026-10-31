# Post 01 · Validate at the edge: reject bad requests before they cost a model call

*Series: [Lesson 09 — Deployment](../README.md) · Post 1 of 9 · about 15 minutes*

> A buggy client sends the whole patient record, 4 MB of it, as the "question". Your server reads it all into memory, sends it to the model, and pays for 1 million input tokens. Another client sends `{"q": "..."}` instead of `{"question": "..."}` and gets a `500` with a stack trace that shows your file paths.

---

## The idea, in plain English

The **edge** is the first code that touches a request. Check everything there, before any expensive work:

1. **Size first.** Stop reading the body once it passes a limit (16 KB is plenty for a question) and answer **413 Payload Too Large**. Don't read 4 MB just to reject it.
2. **Parse safely.** Body isn't JSON? That's the client's mistake: **400**, not 500.
3. **Check the shape** with a schema (zod, from lesson 01): the right field, a string, between 3 and 500 characters after trimming. Fail → **400** with a short list of what's wrong.
4. **Never leak internals.** Unexpected errors become `{"error": "internal error"}`. Details go to your logs, not to the client.

For an LLM service this matters twice: bad input wastes money, and a huge input can be an attack (a "denial of wallet").

---

## Let's see it in code

Open [`example.ts`](./example.ts). It defines the pieces post 06's service reuses, then runs a tiny server and sends it five requests.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `isMain(import.meta.url)` is true only when the file is run directly, so other files can import its functions without running its demo and `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the schema

```ts
// 1. What /ask accepts. trim() first, so "   " counts as too short.
export const AskBody = z.object({ question: z.string().trim().min(3).max(500) });
```

### Step 2 — read the body, with a limit

```ts
// 2. Read the body, but stop at a limit: a 50 MB "question" should never reach your memory or your model.
export async function readJson(req: IncomingMessage, limitBytes = 16_384): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new HttpError(413, 'payload too large');
    chunks.push(chunk as Buffer);
  }
```

`HttpError` is a small error class that carries an HTTP status, so the handler knows what to answer.

### Step 3 — the handler

```ts
  // 3. The handler: read, validate, and answer with a clear error. Never a stack trace.
  const shownParse = new Set<boolean>(); // which safeParse() shapes (success / failure) were already dumped
  const server = createServer(async (req, res) => {
    try {
      const parsed = AskBody.safeParse(await readJson(req));
      // Server side: the full safeParse() result, once per shape (first success, first failure). Notice
      // `data.question` arrives already trimmed, and a failure carries a ZodError whose `issues` say which
      // field failed and why (code, path, message). Later requests show up in the summary lines below.
      if (!shownParse.has(parsed.success)) {
        shownParse.add(parsed.success);
        dump('server: AskBody.safeParse() result', parsed);
      }
      if (!parsed.success) return send(res, 400, { error: 'invalid request', issues: z.flattenError(parsed.error).fieldErrors });
      send(res, 200, { ok: true, question: parsed.data.question }); // post 06 calls the model here
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: status === 500 ? 'internal error' : (e as Error).message });
    }
  });
```

### Step 4 — look at the full response

This is the first HTTP response in the course, so the client helper prints the first one in full. Every later request prints only its one-line summary (`status` and `json`). The later lessons in this folder do the same: they point back here for the full response shape and log just `status` and the JSON fields they care about. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)); `headers` is a key it hides, so the headers go under `httpHeaders`.

```ts
  let firstResponse = true;
  const post = async (label: string, body: string) => {
    const r = await fetch(url, { method: 'POST', body });
    if (firstResponse) {
      firstResponse = false;
      // Client side: the first HTTP response in full. Notice `status`, the content-type header, and that the
      // JSON never contains a stack trace. (clone() leaves the body readable for the line below.) Every
      // later request prints just `status` and `json` in its summary line.
      dump(`client: HTTP response (${label})`, { status: r.status, statusText: r.statusText, httpHeaders: Object.fromEntries(r.headers), json: await r.clone().json() });
    }
```

---

## Run it

From the lesson folder (`09-deployment/`):

```bash
npm run post:01           # no model needed
# or: npx tsx 01-validate-at-the-edge/example.ts
```

### What you should see

The first good request prints the server's `safeParse()` result and the full HTTP response. The first failing request prints its `safeParse()` failure. Every request then prints a one-line summary. The `date` header changes every run:

```
▼ server: AskBody.safeParse() result
{ success: true, data: { question: 'How much is the no-show deposit?' } }
▼ client: HTTP response (a good question)
{
  status: 200,
  statusText: 'OK',
  httpHeaders: {
    connection: 'keep-alive',
    'content-type': 'application/json',
    date: 'Fri, 30 Oct 2026 15:10:00 GMT',
    'keep-alive': 'timeout=5',
    'transfer-encoding': 'chunked'
  },
  json: { ok: true, question: 'How much is the no-show deposit?' }
}
  a good question            → 200 {"ok":true,"question":"How much is the no-show deposit?"}
▼ server: AskBody.safeParse() result
{
  success: false,
  error: ZodError {
    name: 'ZodError',
    issues: [
      {
        origin: 'string',
        code: 'too_small',
        minimum: 3,
        inclusive: true,
        path: [ 'question' ],
        message: 'Too small: expected string to have >=3 characters'
      }
    ]
  }
}
  (hidden for readability: error.stack — set SHOW_RAW=1 to print everything)
  too short                  → 400 {"error":"invalid request","issues":{"question":["Too small: expected string to have >=3 characters"]}}
…
```

What the fields mean:

| Field | What it tells you |
|---|---|
| `success` / `data` | Zod's verdict. On success, `data` is the cleaned value (trimmed), and that is what you pass on. |
| `error.issues[]` | One entry per problem: `code` (e.g. `too_small`, `invalid_type`), `path` (which field) and a `message`. `z.flattenError()` turns these into the `issues` object the client gets. |
| `status` / `statusText` | 200 for a good question, 400 for a bad one, 413 when the body is too big. |
| `httpHeaders['content-type']` | Always `application/json`, even for errors, so clients can always parse the reply. |

"not JSON" and "20 KB body" fail inside `readJson()`, before `safeParse()` runs, so they print only their summary line. The summary lines:

```
a good question            → 200 {"ok":true,"question":"How much is the no-show deposit?"}
too short                  → 400 {"error":"invalid request","issues":{"question":["Too small: expected string to have >=3 characters"]}}
wrong field name           → 400 {"error":"invalid request","issues":{"question":["Invalid input: expected string, received undefined"]}}
not JSON                   → 400 {"error":"invalid JSON"}
20 KB body                 → 413 {"error":"payload too large"}
```

The good question also came back trimmed.

## Common gotchas

- ❌ **Reading the whole body, then checking its size.** The damage (memory) is done. Count while reading.
- ❌ **Bad JSON → 500.** It's a client error: 400.
- ❌ **Returning `e.stack` or the raw zod error.** Return a short, safe message.
- ❌ **No upper length on the question.** Long inputs are long bills, and more room for prompt injection.
- ✅ Validation at the edge is not the same as the guardrails in lesson 06. You still need both.

## Try it yourself

1. Add an optional `language` field that must be `"en"` or `"ar"`, defaulting to `"en"`.
2. Lower the limit to 1 KB and find the longest question that still fits.
3. Add a check for the `content-type` header: anything but `application/json` gets **415**.

## Key takeaways

- Check **size, JSON, shape** at the edge, before any model call.
- Bad input is a **4xx** with a short message; unexpected errors are a plain **500** with no details.
- A schema (zod) gives you validation and a clear list of problems for free.

---

[← Previous: Lesson 08 — Cloud providers & the gateway](../../08-cloud/README.md) · [📚 Series index](../README.md) · [Next: Timeouts that really stop the work →](../02-timeouts-that-abort/README.md)
