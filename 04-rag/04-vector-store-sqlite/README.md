# Post 04 · A vector store on SQLite

*Series: [Lesson 04 — RAG](../README.md) · Post 4 of 8 · about 30 minutes*

> Post 03 re-embedded all 15 chunks every time it ran. Fine for 15. For 200,000 chunks of clinical guidelines, that's hours of embedding **per question**.
>
> You need to embed **once**, save the vectors, and search them from any process, any time.

That's a **vector store**. You don't need a new database product to understand one: this post builds it on Node's built-in **`node:sqlite`**, then shows when to move to pgvector, Qdrant or sqlite-vec.

---

## The idea, in plain English

### Two phases

| Phase | When | What happens |
|---|---|---|
| **Ingest** (indexing) | once, and whenever docs change | read docs → chunk → embed → **save** chunks + vectors |
| **Query** | every question | embed the **question only** → find nearest stored vectors |

Ingest is the expensive part, done offline (a script, a CI job, a queue worker). Queries are cheap: one small embedding call and a search.

### What a vector store actually stores

A row per chunk: the id, the text and metadata you'll need for citations (source, heading), and the **vector**. Here, the vector is saved as a `BLOB` of 32-bit floats: 1,024 numbers × 4 bytes = 4 KB per chunk.

### How it searches

Our store loads the vectors and computes cosine similarity against each in JavaScript: **brute force**, exact, and fast enough up to tens of thousands of chunks. Beyond that, real vector databases build an **approximate nearest-neighbour (ANN) index** (usually HNSW): much faster, very slightly less exact.

### When to use what

| Option | Use it when |
|---|---|
| **SQLite + brute force** (this course) | learning, prototypes, < ~50k chunks, a single process |
| **sqlite-vec** | same SQLite, but a real vector index inside the file |
| **pgvector** (Postgres) | you already run Postgres; you want SQL joins, filters and transactions with your vectors |
| **Qdrant / Weaviate / Pinecone / MongoDB Atlas Vector Search** | very large collections, heavy filtering, a dedicated service |

The **interface** is the same everywhere: `upsert(chunks, vectors)` and `search(queryVector, k)`. Write your app against that interface and you can swap the engine later.

---

## Let's see it in code

Open [`example.ts`](./example.ts) and the store, [`../pipeline/store.ts`](../pipeline/store.ts).

> **Course helpers:** this example imports `embeddingModel`, `section` from `@learn/shared`, the small helper package every lesson uses so that no example names a model or provider. `embeddingModel()` returns the embedding model named in `.env` (`EMBED_MODEL`); and `section()` prints a bold heading in the console output. See [the `@learn/shared` guide](../../shared/README.md) for every helper.

### The table

```ts
CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source TEXT, heading TEXT, text TEXT, embedding BLOB);
```

One plain table. (`chunks_fts` next to it is for post 05.)

### Upsert: save chunks with their vectors

```ts
ins.run(c.id, c.source, c.heading, c.text, new Uint8Array(new Float32Array(embeddings[i]!).buffer));
```

`INSERT OR REPLACE` keyed on the stable chunk id from post 02, inside one transaction (`BEGIN` … `COMMIT`) so a crash can't leave half an ingest.

### Vector search

```ts
vectorSearch(queryEmbedding: number[], k = 5): Hit[] {
  return this.all()
    .map(({ embedding, ...c }) => ({ ...c, score: cosineSimilarity(queryEmbedding, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
```

Exactly post 03's three lines, now reading vectors from the database.

### Ingest with the pipeline

```ts
await ingestDir(store); // the pipeline's ingest: clear → chunk → embedMany → upsert
```

`ingestDir` (in [`../pipeline/rag.ts`](../pipeline/rag.ts)) does what post 03 did by hand, plus one thing:

```ts
store.clear(); // re-ingest from scratch, so chunks of deleted or edited docs don't linger
```

If a policy is deleted, its chunks must go too. The simplest correct approach for a small corpus: rebuild from scratch.

### Query from the stored vectors

```ts
const queryVector = offline ? fakeEmbed(question) : (await embed({ model: embeddingModel(), value: question })).embedding;
store.vectorSearch(queryVector, 3).forEach((h, i) => console.log(`  ${i + 1}. ${h.score.toFixed(3)}  ${h.heading}  [${h.id}]`));
```

Only the question is embedded now.

---

## Run it

From the lesson folder:

```bash
npm run post:04            # EMBED_MODEL; writes data/rag.db (posts 05-08 read it)
npm run post:04:offline    # fake embeddings, in-memory store
# or: npx tsx 04-vector-store-sqlite/example.ts [--offline]
```

### What you should see

```
── 1. Ingest docs/*.md → …/04-rag/data/rag.db ──
stored 15 chunks in 1667 ms

── 2. What a row looks like ──
{ id: 'appointment-cancellation.md#0', heading: 'Outpatient Appointment Cancellation Policy (fictional) › How to cancel', chars: 160, dims: 1024 }

── 3. vectorSearch("can my kid visit grandpa in intensive care?") ──
  1. 0.598  Visiting Hours Policy (…) › Pediatric ward  [visiting-hours.md#2]
  2. 0.578  Visiting Hours Policy (…) › Intensive Care Unit (ICU)  [visiting-hours.md#1]
  3. 0.466  Visiting Hours Policy (…) › General wards  [visiting-hours.md#0]

── 4. Reopen the file (as another process would) ──
a new HybridStore on …/data/rag.db has 15 chunks
```

You may also see `ExperimentalWarning: SQLite is an experimental feature`; that's Node telling you `node:sqlite` is new. It's safe for this course.

## Common gotchas

- ❌ **Node older than 22.5.** `node:sqlite` doesn't exist there. Check `node -v`.
- ❌ **Re-ingesting by appending.** Deleted or edited documents leave stale chunks that keep getting retrieved. Rebuild, or delete by `source` before re-inserting.
- ❌ **Forgetting the model is part of the index.** Store which `EMBED_MODEL` built the index; re-ingest when it changes.
- ❌ **Choosing a vector database before you have 10k chunks.** Start simple; the interface lets you move later.
- ✅ Keep everything you need for a citation (source, heading) in the same row as the vector.

## Try it yourself

1. Open `data/rag.db` with the `sqlite3` CLI (or any SQLite viewer) and run `SELECT id, heading FROM chunks;`.
2. Add a sixth policy to `docs/` (e.g. `parking.md`), run `npm run ingest`, then delete it and ingest again. Check that its chunks are gone.
3. Sketch the same `vectorSearch` on pgvector: `ORDER BY embedding <=> $1 LIMIT $2` (the `pgvector` npm package). What would you add to the table to filter by department?

## Key takeaways

- A vector store saves **chunks + metadata + vectors** so you **ingest once, query many times**.
- On SQLite, a vector is just a Float32 **BLOB**; brute-force cosine is fine at small scale.
- Re-ingest must **remove** stale chunks; ours clears and rebuilds.
- pgvector, Qdrant and sqlite-vec offer the same interface with real indexes for scale.

---

[← Previous: Embeddings and vector search](../03-embeddings-vector-search/README.md) · [📚 Series index](../README.md) · [Next: Hybrid search: keywords + vectors →](../05-hybrid-search/README.md)
