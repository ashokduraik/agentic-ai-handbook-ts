# Post 02 · Chunking

*Series: [Lesson 04 — RAG](../README.md) · Post 2 of 8 · about 25 minutes*

> The search returns this passage for *"can children visit the ICU?"*:
>
> `"the bedside at one time.\n\n## Intensive Care Unit (ICU)\nICU visiting is…"`
>
> Half a sentence about general wards, a heading, and the start of the ICU rule, cut off before the part about children. The model can't answer from that.

Before you can search documents, you cut them into **chunks**: the pieces you embed, retrieve, put in the prompt and cite. How you cut decides what retrieval *can* find. It's the least glamorous step in RAG and one of the most important.

---

## The idea, in plain English

### Why chunk at all?

- An embedding of a whole 30-page document is a blurry average of everything in it: it matches nothing well.
- You can only put a few passages in the prompt (post 01).
- A citation should point at a specific section, not "somewhere in this PDF".

So: **one chunk ≈ one idea**, small enough to be specific, big enough to make sense on its own.

### Fixed-size windows (the naive way)

"Every 500 characters." Easy, and it ignores structure: chunks start mid-sentence, mix two topics, and lose which section they came from.

### Structure-aware chunks (the better default)

Documents already tell you where ideas start and end: **headings**, paragraphs, list items. Split there first. Then:

- **Keep the heading with the chunk** (`"Visiting Hours Policy › Intensive Care Unit (ICU)"`). It adds context the body lacks ("it" → which ward?), improves retrieval, and makes a readable citation.
- **Cap the size.** A very long section is cut into windows of at most `maxChars`.
- **Overlap the windows.** Repeat the last `overlap` characters of one window at the start of the next, so a fact that falls on a boundary is still whole somewhere.
- **Give each chunk a stable id** (`file#index`), so re-ingesting replaces chunks instead of duplicating them.

| Setting | Our default | Typical range |
|---|---|---|
| `maxChars` | 800 (≈200 tokens) | 200–1,000 tokens |
| `overlap` | 120 | 10–20% of the size |

There is no universally best size; lesson 05 shows how to measure it on your questions.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It compares two chunkers on [`visiting-hours.md`](../docs/visiting-hours.md).

> **Course helpers:** this example imports `section` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `section()` prints a bold heading in the console output. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### 1. The naive way

```ts
for (let start = 0; start < policy.length; start += 200) {
  console.log(`  chunk @${String(start).padStart(3)}: ${preview(policy.slice(start, start + 200))}`);
}
```

### 2. Heading-aware: the pipeline's `chunkMarkdown`

```ts
for (const c of chunkMarkdown('visiting-hours.md', policy)) {
```

`chunkMarkdown` lives in [`../pipeline/chunk.ts`](../pipeline/chunk.ts). The whole thing is about 20 lines:

```ts
export interface Chunk {
  id: string; // stable: source#index — lets you re-ingest idempotently
  source: string; // file name, used for citations
  heading: string; // "Doc title › Section"
  text: string;
}
```

```ts
// Split before every heading line, keep the heading with its body.
for (const block of markdown.split(/\n(?=#{1,3} )/)) {
```

The regex splits *before* each line starting with `#`, `##` or `###`, so each block starts with its heading.

```ts
if (level === 1) title = headingText;
```

```ts
const heading = level > 1 ? `${title} › ${headingText}` : title || headingText;
```

Remember the document title (`#`) and prefix it to each section heading.

```ts
// Long sections → sliding windows with overlap so facts on a boundary aren't lost.
for (let start = 0; start < body.length; start += maxChars - overlap) {
  chunks.push({ id: `${source}#${chunks.length}`, source, heading, text: body.slice(start, start + maxChars) });
  if (start + maxChars >= body.length) break;
}
```

Each window starts `maxChars - overlap` after the previous one, so consecutive windows share `overlap` characters.

### 3. Overlap in action

```ts
const icu = chunkMarkdown('visiting-hours.md', policy, 160, 40).filter((c) => c.heading.includes('ICU'));
```

Our policies are short, so with the default 800 characters no section is split. Here we force tiny windows to see the overlap.

---

## Run it

From the lesson folder (no model needed):

```bash
npm run post:02
# or: npx tsx 02-chunking/example.ts
```

### What you should see

```
── 1. Naive: fixed 200-character windows ──
  chunk @  0: "# Visiting Hours Policy (Al Noor General Hospital — fictional)\n\n## Gen"…
  chunk @200: "the bedside at one time.\n\n## Intensive Care Unit (ICU)\nICU visiting is"…
  chunk @400: "ay not visit the ICU unless approved by the charge nurse.\n\n## Pediatri"…

── 2. Heading-aware: chunkMarkdown(source, markdown) ──
  visiting-hours.md#0    Visiting Hours Policy (Al Noor General Hospital — fictional) › General wards
  visiting-hours.md#1    Visiting Hours Policy (Al Noor General Hospital — fictional) › Intensive Care Unit (ICU)
  visiting-hours.md#2    Visiting Hours Policy (Al Noor General Hospital — fictional) › Pediatric ward

── 3. A long section with small windows: maxChars=160, overlap=40 ──
  window 0: "ICU visiting is limited to … Children under 12 may not visit th"
  window 1: "gown. Children under 12 may not visit the ICU unless approved by the charge nurse."
```

Naive chunk `@200` mixes two wards and `@400` starts with "ay not visit". The heading-aware chunks are one section each, with a label.

## Common gotchas

- ❌ **Chunks too big.** Retrieval gets vague, prompts get expensive. ❌ **Too small.** Each chunk lacks context ("it is limited to 11:00–12:00": what is?).
- ❌ **Dropping the heading.** It's often the only place the topic is named.
- ❌ **Random ids** (UUIDs per run). Re-ingesting duplicates everything. Use `source#index` or a content hash.
- ❌ **Tables and lists cut in half.** For PDFs and HTML, use a parser that understands the layout (e.g. unstructured.io, LlamaIndex.TS readers) before chunking.
- ✅ Look at your chunks. Print them. Most chunking bugs are obvious once you read ten chunks.

## Try it yourself

1. In part 3, set `overlap` to `0`. Is the "Children under 12" rule whole in any window now?
2. Write a paragraph-based chunker (split on `\n\n`) and compare its output with `chunkMarkdown` on [`medication-refill.md`](../docs/medication-refill.md).
3. Add a 4,000-character section to a copy of a doc and check how many windows `chunkMarkdown` produces with the defaults.

## Key takeaways

- A **chunk** is the unit you embed, retrieve, prompt with and cite.
- Split by **structure** (headings) first, then cap the **size** with **overlap**.
- Keep the **heading** with each chunk and give it a **stable id**.
- Chunk size is a parameter to **measure**, not guess (lesson 05).

---

[← Previous: Why RAG?](../01-why-rag/README.md) · [📚 Series index](../README.md) · [Next: Embeddings and vector search →](../03-embeddings-vector-search/README.md)
