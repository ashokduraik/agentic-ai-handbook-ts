/**
 * Post 06 — Embeddings   (read the blog post first: 06-embeddings/README.md)
 *
 * An embedding turns a text into a list of numbers (a vector) that captures its MEANING.
 * Texts with similar meaning get vectors pointing in a similar direction; we measure that
 * with cosine similarity (1 = same direction, 0 = unrelated).
 *
 * Run:  npx tsx 06-embeddings/example.ts            (part A + parts B/C with your EMBED_MODEL)
 *       npx tsx 06-embeddings/example.ts --offline  (part A only: cosine similarity on tiny hand-made vectors)
 */
import { cosineSimilarity, embed, embedMany } from 'ai';
// embeddingModel() reads EMBED_MODEL (and AI_PROVIDER) from .env — an embedding model, not a chat model.
import { embeddingModel, section } from '@learn/shared';

// ---------------------------------------------------------------------------
// Part A: the maths, with 3-number vectors you can check by hand
// ---------------------------------------------------------------------------
section('[A] Cosine similarity on tiny hand-made vectors (no model)');
// Pretend the three numbers mean [heart-related, billing-related, children-related].
const chestPain = [0.9, 0.0, 0.1];
const palpitations = [0.8, 0.1, 0.0];
const invoice = [0.0, 1.0, 0.0];
console.log('chest pain vs palpitations:', cosineSimilarity(chestPain, palpitations).toFixed(2), '← similar meaning, close to 1');
console.log('chest pain vs invoice:     ', cosineSimilarity(chestPain, invoice).toFixed(2), '← unrelated, close to 0');

if (process.argv.includes('--offline')) process.exit(0);

// ---------------------------------------------------------------------------
// Part B: real embeddings from your EMBED_MODEL
// ---------------------------------------------------------------------------
section('[B] Real embeddings: which sentences are close in meaning?');
const sentences = [
  'The patient has chest pain when walking upstairs.',
  'He gets tightness in his chest during exercise.', // same meaning, almost no shared words
  'I need a copy of my hospital bill.',
  'Where can I download my invoice?', // same meaning as the bill sentence
  'My child has a fever and a rash.',
];
// embedMany sends all texts in one go and returns one vector per text, in the same order.
const { embeddings } = await embedMany({ model: embeddingModel(), values: sentences });
console.log(`Each sentence became a vector of ${embeddings[0]!.length} numbers. First 5 of sentence 1:`, embeddings[0]!.slice(0, 5).map((n) => n.toFixed(3)));

// Similarity of every sentence to every other one (a small table).
console.log('\n      ' + sentences.map((_, j) => `  S${j + 1} `).join(''));
embeddings.forEach((a, i) => {
  console.log(`  S${i + 1}  ` + embeddings.map((b) => cosineSimilarity(a, b).toFixed(2).padStart(5) + ' ').join(''));
});
sentences.forEach((s, i) => console.log(`  S${i + 1} = ${s}`));

// ---------------------------------------------------------------------------
// Part C: semantic search — find the closest sentence to a new question
// ---------------------------------------------------------------------------
section('[C] Semantic search: closest sentence to a new question');
const query = 'Is it normal to feel pressure in the chest on the stairs?';
const { embedding: q } = await embed({ model: embeddingModel(), value: query });
const ranked = sentences
  .map((s, i) => ({ s, score: cosineSimilarity(q, embeddings[i]!) }))
  .sort((a, b) => b.score - a.score);
console.log('Question:', query);
ranked.forEach((r, i) => console.log(`  ${i + 1}. ${r.score.toFixed(2)}  ${r.s}`));
console.log('Look for: the two chest sentences rank at the top, even though they share few words with the question.');
