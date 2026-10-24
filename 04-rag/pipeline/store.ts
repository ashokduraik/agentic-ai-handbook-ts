/**
 * Posts 04 (vectors) and 05 (keywords + hybrid) walk through this file.
 *
 * A small vector + keyword store on Node's built-in SQLite (`node:sqlite`, no native deps).
 *  - Vectors: Float32Array blobs; similarity by brute-force cosine in JS. Fine up to ~50k chunks.
 *    Beyond that use a real index (pgvector HNSW, Qdrant, sqlite-vec) — same interface.
 *  - Keywords: SQLite FTS5 with BM25 ranking. Catches exact terms embeddings miss
 *    (drug names, codes like "ICD-10 I10", phone numbers, ids).
 *  - Hybrid: Reciprocal Rank Fusion (RRF) merges the two rankings without tuning score scales.
 */
import { DatabaseSync } from 'node:sqlite';
import { cosineSimilarity } from 'ai';
import type { Chunk } from './chunk.ts';

export interface Hit extends Chunk {
  score: number;
}

export class HybridStore {
  readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source TEXT, heading TEXT, text TEXT, embedding BLOB);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, heading, text);
    `);
  }

  upsert(chunks: Chunk[], embeddings: number[][]) {
    const del = this.db.prepare('DELETE FROM chunks_fts WHERE id = ?');
    const ins = this.db.prepare('INSERT OR REPLACE INTO chunks VALUES (?, ?, ?, ?, ?)');
    const fts = this.db.prepare('INSERT INTO chunks_fts (id, heading, text) VALUES (?, ?, ?)');
    this.db.exec('BEGIN');
    chunks.forEach((c, i) => {
      ins.run(c.id, c.source, c.heading, c.text, new Uint8Array(new Float32Array(embeddings[i]!).buffer));
      del.run(c.id);
      fts.run(c.id, c.heading, c.text);
    });
    this.db.exec('COMMIT');
  }

  /** Remove everything (used before a full re-ingest). */
  clear() {
    this.db.exec('DELETE FROM chunks; DELETE FROM chunks_fts;');
  }

  count(): number {
    return Number((this.db.prepare('SELECT count(*) AS n FROM chunks').get() as { n: number }).n);
  }

  private all(): (Chunk & { embedding: number[] })[] {
    return (this.db.prepare('SELECT * FROM chunks').all() as unknown as (Chunk & { embedding: Uint8Array })[]).map(
      (r) => ({ ...r, embedding: Array.from(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)) }),
    );
  }

  vectorSearch(queryEmbedding: number[], k = 5): Hit[] {
    return this.all()
      .map(({ embedding, ...c }) => ({ ...c, score: cosineSimilarity(queryEmbedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  keywordSearch(query: string, k = 5): Hit[] {
    // Turn free text into a safe FTS5 OR-query of terms (avoids FTS syntax errors on "?", "-" etc.).
    const terms = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    if (!terms.length) return [];
    const rows = this.db
      .prepare(
        `SELECT c.id, c.source, c.heading, c.text, bm25(chunks_fts) AS rank
         FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.id
         WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(terms.map((t) => `"${t}"`).join(' OR '), k) as unknown as (Chunk & { rank: number })[];
    return rows.map(({ rank, ...c }) => ({ ...c, score: -rank })); // bm25(): lower = better
  }

  /** RRF: score = Σ 1/(k + rank). k=60 is the value from the original paper; rarely needs tuning. */
  hybridSearch(query: string, queryEmbedding: number[], k = 5, rrfK = 60): Hit[] {
    const fused = new Map<string, Hit>();
    for (const list of [this.vectorSearch(queryEmbedding, k * 2), this.keywordSearch(query, k * 2)]) {
      list.forEach((hit, rank) => {
        const prev = fused.get(hit.id);
        fused.set(hit.id, { ...hit, score: (prev?.score ?? 0) + 1 / (rrfK + rank + 1) });
      });
    }
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}
