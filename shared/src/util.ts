/** Tiny helpers shared by examples. Kept deliberately small. */
import { inspect } from 'node:util';

/** Print a section header so example output is easy to scan. */
export function section(title: string) {
  console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\x1b[0m`);
}

/** Pretty-print any value. */
export function show(label: string, value: unknown) {
  console.log(`${label}:`, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

/** True when this file is the process entry point (lets modules double as libraries and CLIs). */
export function isMain(importMetaUrl: string): boolean {
  return process.argv[1] !== undefined && importMetaUrl === new URL(`file://${process.argv[1]}`).href;
}

/** Strip <think>...</think> blocks some reasoning models emit inline in text. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// ---------------------------------------------------------------------------
// dump(): print the FULL value a call returned, in a readable form
// ---------------------------------------------------------------------------
/** Keys whose values are big, noisy transport details (raw HTTP bodies, headers, raw provider payloads). */
const NOISY_KEYS = new Set([
  'body', 'headers', 'rawResponse', 'rawRequest', 'rawCall', 'rawValue', 'rawChunk',
  'responseHeaders', 'requestBodyValues', // on API errors: the HTTP headers and the whole request that was sent
]);
/** Numeric arrays longer than this are shortened to "length + first few values" (embeddings!). */
const MAX_NUMBERS = 8;
/** …but lists of whole numbers (token ids) are printed in full up to this length. */
const MAX_INTEGERS = 64;
/** Strings longer than this are cut, with a note saying how much was cut. */
const MAX_STRING = 1200;
/** providerMetadata bigger than this (as JSON) is summarised instead of printed. */
const MAX_PROVIDER_METADATA = 400;
/** LangChain's serialisation bookkeeping on every message (`lc_kwargs` repeats all the fields). */
/** "_x" keys are private internals; "__x__" keys (LangGraph's `__interrupt__`) are public signals and stay. */
const isInternalKey = (k: string) => k.startsWith('_') && !/^__\w+__$/.test(k);
const isLangChainKey = (k: string) => k.startsWith('lc_');
/** AI SDK convenience aliases that repeat data shown elsewhere in the same object. */
const ALIAS_KEYS: Record<string, string> = {
  finalStep: 'same as the last item of steps',
  responseMessages: 'same as response.messages',
  staticToolCalls: 'subset of toolCalls',
  dynamicToolCalls: 'subset of toolCalls',
  staticToolResults: 'subset of toolResults',
  dynamicToolResults: 'subset of toolResults',
};

/** A value that prints as-is (no quotes) — used for the "[… hidden …]" placeholders. */
const note = (text: string) => ({ [inspect.custom]: () => `\x1b[2m${text}\x1b[22m` });
const plainNote = (text: string) => ({ [inspect.custom]: () => text });
const size = (s: string) => (s.length > 1024 ? `${(s.length / 1024).toFixed(1)} kB` : `${s.length} chars`);

/**
 * Turn any value into something `util.inspect` prints well:
 * - class instances (like the AI SDK's result objects) expose their data through *getters*,
 *   which `console.log` does not show — so we read the getters and copy them into a plain object;
 * - long numeric arrays (embeddings) become "[1024 numbers: 0.01, -0.02, …]";
 * - noisy fields (HTTP bodies, headers, raw payloads) are replaced by a short note, and their
 *   paths are collected so `dump` can say what it hid.
 */
function toReadable(value: unknown, path: string, depth: number, seen: WeakSet<object>, hidden: string[], color: boolean): unknown {
  const mark = color ? note : plainNote;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [+${value.length - MAX_STRING} chars cut]` : value;
  }
  // Long decimals (timings, rates) are rounded to 2 places so they are easy to read.
  if (typeof value === 'number' && !Number.isInteger(value) && Math.abs(value) >= 1) return Math.round(value * 100) / 100;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp) return value;
  if (value instanceof Error) return errorToReadable(value, path, depth, seen, hidden, color);
  if (value instanceof Promise) return mark('[Promise — await it first]');
  if (typeof (value as { getReader?: unknown }).getReader === 'function') return mark('[ReadableStream]');
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const arr = Array.from(value as unknown as ArrayLike<number>);
    return arr.length > MAX_NUMBERS ? toReadable(arr, path, depth, seen, hidden, color) : value;
  }
  if (seen.has(value)) return mark('[Circular]');
  if (depth < 0) return mark(Array.isArray(value) ? `[Array(${value.length})]` : '[Object]');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // Embeddings (many decimals) are shortened; short integer lists such as token ids are kept whole.
      const numeric = value.length > MAX_NUMBERS && value.every((v) => typeof v === 'number');
      if (numeric && (value.length > MAX_INTEGERS || value.some((v: number) => !Number.isInteger(v)))) {
        const head = value.slice(0, 4).map((n: number) => +n.toFixed(4)).join(', ');
        return mark(`[${value.length} numbers: ${head}, …]`);
      }
      return value.map((v, i) => toReadable(v, `${path}[${i}]`, depth - 1, seen, hidden, color));
    }
    if (value instanceof Map) {
      return new Map([...value].map(([k, v]) => [k, toReadable(v, `${path}.${String(k)}`, depth - 1, seen, hidden, color)]));
    }
    if (value instanceof Set) return new Set([...value].map((v) => toReadable(v, path, depth - 1, seen, hidden, color)));

    // Collect own enumerable keys, plus getters defined on classes (that's where the AI SDK keeps
    // `text`, `toolCalls`, `usage`, … on its result objects). Keys starting with "_" are internal.
    const keys: string[] = [];
    for (let p = Object.getPrototypeOf(value); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(p))) {
        if (d.get && !isInternalKey(k) && !keys.includes(k)) keys.push(k);
      }
    }
    for (const k of Object.keys(value)) if (!isInternalKey(k) && !keys.includes(k)) keys.push(k);

    const name = value.constructor && value.constructor !== Object ? value.constructor.name : '';
    const out: Record<string, unknown> = {};
    if (keys.some(isLangChainKey)) hidden.push(path ? `${path}.lc_*` : 'lc_*');
    for (const k of keys) {
      if (isLangChainKey(k)) continue;
      const childPath = path ? `${path}.${k}` : k;
      let v: unknown;
      try {
        v = (value as Record<string, unknown>)[k];
      } catch (e) {
        out[k] = mark(`[throws: ${(e as Error).message.split('\n')[0]}]`);
        continue;
      }
      if (typeof v === 'function') continue;
      if (v === undefined) continue; // fields the provider left empty are skipped (SHOW_RAW=1 shows them)
      // LangChain keeps a model's thinking twice: here and as a 'reasoning' block in `contentBlocks`.
      if (k === 'reasoning_content' && typeof v === 'string') {
        out[k] = mark(`[same text as the 'reasoning' block in contentBlocks: ${size(v)}]`);
        continue;
      }
      if (k in ALIAS_KEYS && typeof v === 'object' && v !== null) {
        out[k] = mark(`[${ALIAS_KEYS[k]}]`);
        continue;
      }
      if (NOISY_KEYS.has(k)) {
        const desc = typeof v === 'string' ? size(v) : `${Object.keys(v as object).length} keys`;
        hidden.push(childPath);
        out[k] = mark(`[hidden ${k}: ${desc}]`);
        continue;
      }
      if (k === 'providerMetadata' || k === 'providerOptions') {
        const json = JSON.stringify(v) ?? '';
        if (json.length > MAX_PROVIDER_METADATA) {
          hidden.push(childPath);
          out[k] = mark(`[hidden ${k}: ${size(json)}]`);
          continue;
        }
      }
      out[k] = toReadable(v, childPath, depth - 1, seen, hidden, color);
    }
    // Keep the class name visible (e.g. "DefaultGenerateTextResult {") — it tells you what you got back.
    if (!name) return out;
    const Named = { [name]: class {} }[name]!;
    return Object.assign(Object.create(Named.prototype), out);
  } finally {
    seen.delete(value);
  }
}

/**
 * Errors: show what you can act on (name, message, statusCode, isRetryable, cause, …) and hide the
 * stack trace (it only says where in node_modules the error was thrown). Zod errors keep `issues`
 * and drop `message`, which is the same issues again as one long JSON string; an error that wraps
 * a `cause` keeps only the first line of a multi-line message (the rest repeats the cause).
 */
function errorToReadable(e: Error, path: string, depth: number, seen: WeakSet<object>, hidden: string[], color: boolean): unknown {
  const mark = color ? note : plainNote;
  if (seen.has(e)) return mark('[Circular]');
  if (depth < 0) return mark(`[${e.name}: ${e.message.split('\n')[0]}]`);
  seen.add(e);
  try {
    const own = e as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = { name: e.name };
    // A long multi-line message that wraps a `cause` usually repeats the cause: keep its first line.
    const firstLine = e.message.split('\n')[0]!;
    const message = own.cause instanceof Error && firstLine.length < e.message.length
      ? `${firstLine} … [+${e.message.length - firstLine.length} chars, the details are in cause]`
      : e.message;
    if (!Array.isArray(own.issues)) out.message = toReadable(message, `${path}.message`, depth - 1, seen, hidden, color);
    for (const k of Object.getOwnPropertyNames(e)) {
      if (k === 'stack' || k === 'message' || k === 'name' || isInternalKey(k)) continue;
      const v = own[k];
      if (v === undefined || typeof v === 'function') continue;
      const childPath = path ? `${path}.${k}` : k;
      if (NOISY_KEYS.has(k) && v !== null) {
        hidden.push(childPath);
        out[k] = mark(`[hidden ${k}: ${typeof v === 'string' ? size(v) : `${Object.keys(v as object).length} keys`}]`);
        continue;
      }
      out[k] = toReadable(v, childPath, depth - 1, seen, hidden, color);
    }
    if (e.stack) hidden.push(path ? `${path}.stack` : 'stack');
    const name = e.constructor?.name || 'Error';
    const Named = { [name]: class {} }[name]!;
    return Object.assign(Object.create(Named.prototype), out);
  } finally {
    seen.delete(e);
  }
}

/**
 * Print the FULL value a call returned, clearly labelled, in a readable form.
 *
 *   dump('generateText() result', result);
 *
 * - Pretty-prints with `util.inspect` (colours in a terminal, nested objects shown to `depth`).
 * - Reads class getters, so AI SDK result objects show `text`, `usage`, `steps`, … (plain
 *   `console.log(result)` would not).
 * - Shortens long number arrays (embeddings) to their length and first values.
 * - Prints errors as their useful fields (name, message, statusCode, cause, …) without the stack.
 * - Hides noisy transport fields (HTTP `body`, `headers`, raw payloads, big `providerMetadata`)
 *   and LangChain's `lc_*` serialisation fields, and prints one line saying what it hid.
 * - Set `SHOW_RAW=1` in `.env` (or the shell) to print everything, untouched.
 *
 * Returns `value`, so you can wrap a call: `const r = dump('r', await f())`.
 */
export function dump<T>(label: string, value: T, opts: { depth?: number } = {}): T {
  const raw = ['1', 'true', 'yes'].includes((process.env.SHOW_RAW ?? '').toLowerCase());
  const color = process.env.NO_COLOR === undefined && (process.env.FORCE_COLOR !== undefined || !!process.stdout.isTTY);
  const hidden: string[] = [];
  const readable = raw ? value : toReadable(value, '', opts.depth ?? 10, new WeakSet(), hidden, color);
  const body = inspect(readable, {
    colors: color,
    depth: raw ? Infinity : (opts.depth ?? 10),
    maxArrayLength: raw ? Infinity : 20,
    maxStringLength: raw ? Infinity : MAX_STRING + 40,
    breakLength: 100,
    sorted: false,
  });
  console.log(`${color ? '\x1b[36m' : ''}▼ ${label}${color ? '\x1b[39m' : ''}\n${body}`);
  if (hidden.length) {
    // Collapse array indexes so steps[0].request.body and steps[1].request.body count once.
    const uniq = [...new Set(hidden.map((p) => p.replace(/\[\d+\]/g, '[]')))];
    const list = uniq.slice(0, 6).join(', ') + (uniq.length > 6 ? `, +${uniq.length - 6} more` : '');
    console.log(`${color ? '\x1b[2m' : ''}  (hidden for readability: ${list} — set SHOW_RAW=1 to print everything)${color ? '\x1b[22m' : ''}`);
  }
  return value;
}
