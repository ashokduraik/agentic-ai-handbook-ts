/**
 * Post 04 — A vector store on SQLite   (read the blog post first: 04-vector-store-sqlite/README.md)
 *
 * Post 03 kept vectors in a JS array and re-embedded every run. A vector STORE keeps them:
 *   ingest once (chunk → embed → save), then search many times, from any process.
 * Our store is pipeline/store.ts: Node's built-in `node:sqlite`, vectors as BLOBs, cosine in JS.
 *
 * Run: npx tsx 04-vector-store-sqlite/example.ts            (uses EMBED_MODEL, writes data/rag.db)
 *      npx tsx 04-vector-store-sqlite/example.ts --offline  (fake embeddings, in-memory store)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embed } from 'ai';
import { embeddingModel, section } from '@learn/shared';
import { DB_PATH, DOCS_DIR, chunkMarkdown, ingestDir, openStore } from '../pipeline/rag.ts';
import { fakeEmbed } from '../pipeline/offline-fakes.ts';

const offline = process.argv.includes('--offline');
const question = 'can my kid visit grandpa in intensive care?';

// 1. INGEST (once, or whenever the docs change): chunk → embed → upsert into SQLite.
section(`1. Ingest docs/*.md → ${offline ? ':memory:' : DB_PATH}`);
const store = openStore(offline ? ':memory:' : DB_PATH);
const t0 = performance.now();
if (offline) {
  const chunks = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));
  store.upsert(chunks, chunks.map((c) => fakeEmbed(`${c.heading}\n${c.text}`)));
} else {
  await ingestDir(store); // the pipeline's ingest: clear → chunk → embedMany → upsert
}
console.log(`stored ${store.count()} chunks in ${Math.round(performance.now() - t0)} ms`);

// 2. Look inside: it's just a table. Vectors are Float32 BLOBs (4 bytes per number).
section('2. What a row looks like');
const row = store.db.prepare('SELECT id, heading, length(text) AS chars, length(embedding) / 4 AS dims FROM chunks LIMIT 1').get();
console.log(row);

// 3. QUERY (every request): embed only the question, then ask the store.
section(`3. vectorSearch("${question}")`);
const queryVector = offline ? fakeEmbed(question) : (await embed({ model: embeddingModel(), value: question })).embedding;
store.vectorSearch(queryVector, 3).forEach((h, i) => console.log(`  ${i + 1}. ${h.score.toFixed(3)}  ${h.heading}  [${h.id}]`));

// 4. It persists: a brand-new store object on the same file sees the same chunks (no re-embedding).
if (!offline) {
  section('4. Reopen the file (as another process would)');
  console.log(`a new HybridStore on ${DB_PATH} has ${openStore().count()} chunks`);
}
