/** Guardrails used by the capstone agent (lesson 06 teaches each kind in depth). */
const INJECTION = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /(reveal|print|show).{0,20}(system prompt|instructions)/i,
  /you are now (in )?(developer|dan|jailbreak)/i,
];

export function inputGuard(text: string): { allowed: true } | { allowed: false; reason: string } {
  if (text.length > 1000) return { allowed: false, reason: 'input too long' };
  const hit = INJECTION.find((p) => p.test(text));
  return hit ? { allowed: false, reason: 'possible prompt injection' } : { allowed: true };
}

/** Redact direct identifiers. Applied to tool results BEFORE the model sees them, and to the final answer. */
export function redactPII(text: string): string {
  return text
    .replace(/\b[12]\d{9}\b/g, '[NATIONAL_ID]')
    .replace(/(\+?966|0)5\d{8}\b/g, '[PHONE]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]');
}

/** A domain output rule: the scheduling assistant must not give dosing instructions. */
export function outputGuard(text: string): { ok: true } | { ok: false; reason: string } {
  return /\b(take|increase|decrease|double|stop taking)\b.{0,40}\b(\d+\s?mg|dose|tablets?)\b/i.test(text)
    ? { ok: false, reason: 'contains medication dosing advice' }
    : { ok: true };
}
