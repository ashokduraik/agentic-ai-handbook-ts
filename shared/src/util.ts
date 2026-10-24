/** Tiny helpers shared by examples. Kept deliberately small. */

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
