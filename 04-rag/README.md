# Lesson 04 — RAG: retrieval that actually works, a blog series

**From "why can't the model just answer?" to a hybrid-search, reranked, cited RAG pipeline on plain SQLite, in 8 short posts.**

Ask a model about **your** hospital's no-show policy and it will answer confidently, and wrongly: it has never seen your policy. Fine-tuning is slow and expensive, and policies change every month. The standard fix is **Retrieval-Augmented Generation (RAG)**: find the right passages in your documents first, then let the model answer **from those passages only**, with citations.

RAG is the most requested AI skill in the job postings of the learning map. It is also easy to do badly. This series builds it one piece at a time, on Node's built-in SQLite, so every step is visible: chunking, embeddings, a vector store, keyword + vector (hybrid) search, reranking, and grounded answers that refuse when the documents don't say.

Each post is a short blog article: a real problem, the idea in plain English, then a small runnable TypeScript file walked through piece by piece. Read them in order.

## What you will be able to do

This lesson covers **Topic 4 — RAG & retrieval** of the learning map (`agentic-ai-nodejs-learning-map.md`). In plain words, the goal is:

> **Answer questions from your own documents reliably: split them into good chunks, find the right ones with keywords and meaning together, put the best on top, and answer only from them, with citations you can check, or say "I don't know".**

After the 8 posts you should be able to:

1. **Explain** RAG (retrieve → augment → generate) and why it beats "ask the model" and "paste everything".
2. **Chunk** documents by structure (headings) with size limits and overlap.
3. **Embed** chunks and search them by meaning with cosine similarity.
4. **Store** vectors in a database (SQLite here) and know when to reach for pgvector, Qdrant or sqlite-vec.
5. **Combine** keyword search (BM25) and vector search with Reciprocal Rank Fusion.
6. **Rerank** candidates with a model, and measure whether it helps.
7. **Generate grounded answers** with numbered citations, refusal, and a citation check in code.
8. **Read and reuse** the complete pipeline that lessons 05 and 09 import as `@learn/rag`.

## Set up once (5 minutes)

If you finished lesson 01's setup, you are already done. Otherwise:

```bash
# 1. at the repo root (agentic-ai-handbook-ts/); needs Node 22.5+ for node:sqlite
npm install

# 2. models live in .env only (no code names a model)
cp .env.example .env
#    set CHAT_MODEL  → any chat model (posts 01, 06, 07, 08)
#    set EMBED_MODEL → an embedding model (posts 03-08)
#    RERANKER=llm or none (post 08 / the pipeline; see post 06 before choosing)

# 3. check that Ollama is reachable and your models exist
npm run check:ollama

# 4. prove the setup works, without calling any model
cd 04-rag
npm run test:offline
```

The examples use the course helper package **`@learn/shared`**: it loads the models named in `.env` (`chatModel()`, `embeddingModel()`), reads settings (`env`), and prints readable output (`section()`, `stripThinking()`). See [the `@learn/shared` guide](../shared/README.md) for every helper.

Post 04 creates the SQLite file `data/rag.db` (git-ignored); posts 05–08 read it. `npm run ingest` rebuilds it at any time.

## The posts

| # | Post | What you'll learn |
|---|---|---|
| 1 | [Why RAG?](01-why-rag/README.md) | The same policy question answered closed-book, with every document pasted in, and with retrieval. |
| 2 | [Chunking](02-chunking/README.md) | Why fixed-size windows hurt, and heading-aware chunks with overlap. |
| 3 | [Embeddings and vector search](03-embeddings-vector-search/README.md) | Semantic search over the policies in 20 lines, no database. |
| 4 | [A vector store on SQLite](04-vector-store-sqlite/README.md) | Ingest once, query many times: vectors as BLOBs in `node:sqlite`, and when to use pgvector or Qdrant. |
| 5 | [Hybrid search: keywords + vectors](05-hybrid-search/README.md) | BM25 for exact terms, vectors for meaning, Reciprocal Rank Fusion to combine them. |
| 6 | [Reranking](06-reranking/README.md) | A second, careful pass that reads question and passage together, and why you must measure it. |
| 7 | [Grounded answers with citations](07-grounded-answers-citations/README.md) | Numbered sources, structured output, refusal, and checking citations in code. |
| 8 | [The full pipeline](08-full-pipeline/README.md) | `pipeline/` end to end: the `ingest`, `search` and `ask` commands that later lessons reuse. |

**How to read each post:** read it top to bottom with its `example.ts` open beside it, run the command in its "Run it" section, then do the "Try it yourself" exercises. Post 8 ends with the **week-4 exercise from the learning map**.

## Running the examples

| Command | What it does |
|---|---|
| `npm run post:01` … `npm run post:08` | Run one post's example (posts 03–08 need `EMBED_MODEL`; 01, 06, 07, 08 also `CHAT_MODEL`). |
| `npm run post:01:offline` (also 03–07) | The same code with fake embeddings / a fake model, no Ollama needed. |
| `npm run ingest` | Rebuild `data/rag.db` from `docs/*.md`. |
| `npm run search -- "<question>"` | Vector vs keyword vs hybrid results side by side. |
| `npm run ask -- "<question>"` | The full pipeline: retrieve → rerank → cited answer. |
| `npm run test:offline` | The pipeline's unit checks plus every post's offline mode. |
| `npm run typecheck` / `npm run check:links` | Type-check everything / check every link in these posts. |

## What's in this folder

```
04-rag/
├── README.md                        ← you are here (series index)
├── 01-why-rag/                      README.md (the post) + example.ts (the code)
├── 02-chunking/
├── 03-embeddings-vector-search/
├── 04-vector-store-sqlite/
├── 05-hybrid-search/
├── 06-reranking/
├── 07-grounded-answers-citations/
├── 08-full-pipeline/
├── pipeline/                        the reusable RAG module (@learn/rag): chunk.ts, store.ts, rerank.ts, rag.ts
│                                    + offline-fakes.ts and offline-test.ts (no-model checks)
├── docs/                            5 fictional hospital policies: the knowledge base
├── data/                            rag.db, created by post 04 / npm run ingest (git-ignored)
├── scripts/check-links.mjs
├── package.json
└── tsconfig.json
```

The posts teach each idea with a small example, then point at the matching code in `pipeline/`. Post 8 puts it all together.

**Start here → [Post 1: Why RAG?](01-why-rag/README.md)**

---

**Before this lesson:** [Lesson 03 — MCP](../03-mcp/README.md) (tools, resources and prompts any agent can discover). Embedding basics are in [lesson 01, post 06](../01-foundations-structured-output/06-embeddings/README.md).
**After this lesson:** [Lesson 05 — Evals](../05-evals/README.md) measures this pipeline: retrieval hit rate, refusals, citations and faithfulness.
