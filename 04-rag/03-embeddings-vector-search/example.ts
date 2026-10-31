/**
 * Post 03 — Embeddings and vector search   (read the blog post first: 03-embeddings-vector-search/README.md)
 *
 * Semantic search in ~20 lines, with no database:
 *   1. embed every chunk once (a list of numbers that captures its MEANING),
 *   2. embed the question,
 *   3. rank chunks by cosine similarity to the question.
 * The question says "kid" and "grandpa"; the policy says "children under 12" and "immediate family".
 * No shared words needed: the three visiting-hours sections still beat every other chunk.
 *
 * Run: npx tsx 03-embeddings-vector-search/example.ts ["your question"]   (uses EMBED_MODEL)
 *      npx tsx 03-embeddings-vector-search/example.ts --offline          (fake embeddings: mechanics only)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cosineSimilarity, embed, embedMany } from 'ai';
import { dump, embeddingModel, env, section } from '@learn/shared';
import { DOCS_DIR, chunkMarkdown } from '../pipeline/rag.ts';
import { fakeEmbed } from '../pipeline/offline-fakes.ts';

const offline = process.argv.includes('--offline');
const question = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'can my kid visit grandpa in intensive care?';

const chunks = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith('.md'))
  .flatMap((f) => chunkMarkdown(f, readFileSync(join(DOCS_DIR, f), 'utf8')));

// 1. Embed all chunks in one batched call. Embed "heading + text": the heading adds context.
const texts = chunks.map((c) => `${c.heading}\n${c.text}`);
const many = offline ? { embeddings: texts.map(fakeEmbed) } : await embedMany({ model: embeddingModel(), values: texts });
// Only the fields this post needs (the full embedMany result is in lesson 01, post 06). Notice `embeddings`
// has one vector per input, in the SAME order as `values`; `usage.tokens` is what you pay (offline: no usage).
console.log('embedMany: embeddings.length =', many.embeddings.length, '| usage.tokens =', 'usage' in many ? many.usage.tokens : 'n/a (offline)');
const chunkVectors = many.embeddings;

// 2. Embed the question with the SAME model (vectors from different models are not comparable).
const one = offline ? { embedding: fakeEmbed(question) } : await embed({ model: embeddingModel(), value: question });
// ONE `embedding` for the question, the same length as every chunk vector (printed below). That equal
// length is what makes cosine similarity possible. (Full embed result: lesson 01, post 06.)
console.log('embed: usage.tokens =', 'usage' in one ? one.usage.tokens : 'n/a (offline)');
const queryVector = one.embedding;

section(`What an embedding looks like (${offline ? 'fake' : env.embedModel})`);
console.log(`${chunkVectors[0]!.length} numbers, starting [${chunkVectors[0]!.slice(0, 5).map((n) => n.toFixed(3)).join(', ')}, …]`);

// 3. Score every chunk against the question and sort: that's all "vector search" is.
section(`Top 3 for: "${question}"`);
const ranked = chunks
  .map((c, i) => ({ heading: c.heading, score: cosineSimilarity(queryVector, chunkVectors[i]!) }))
  .sort((a, b) => b.score - a.score);
ranked.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r.score.toFixed(3)}  ${r.heading}`));
// The raw top hits. Notice the scores are close together: cosine scores are only meaningful
// relative to each other, not as absolute "percent relevant".
dump('top 3 hits', ranked.slice(0, 3));
console.log(`  …  lowest: ${ranked.at(-1)!.score.toFixed(3)}  ${ranked.at(-1)!.heading}`);
