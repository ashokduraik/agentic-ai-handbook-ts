/**
 * Loads the repo-root `.env` once (Node 22+ has `process.loadEnvFile`, so no dotenv needed)
 * and exposes typed accessors. Every example imports from here, so model choice lives
 * in ONE place: your `.env`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Read a required env var, failing with an actionable message instead of a deep stack trace. */
export function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith('<')) {
    throw new Error(
      `Missing env var ${name}. Copy .env.example to .env at the repo root and set it ` +
        `(for Ollama: pick a model from \`ollama list\`).`,
    );
  }
  return v;
}

export function optional(name: string, fallback?: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && !v.startsWith('<') ? v : fallback;
}

export const env = {
  /** ollama | azure | bedrock | openai-compatible (see 08-cloud) */
  get provider() {
    return optional('AI_PROVIDER', 'ollama')!;
  },
  get ollamaBaseUrl() {
    return optional('OLLAMA_BASE_URL', 'http://localhost:11434')!.replace(/\/$/, '');
  },
  get chatModel() {
    return required('CHAT_MODEL');
  },
  get embedModel() {
    return required('EMBED_MODEL');
  },
  /** Optional second model: fallback chain in 06, and the `fast` alias in 08. */
  get fallbackModel() {
    return optional('FALLBACK_MODEL');
  },
};
