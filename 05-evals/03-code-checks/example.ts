/**
 * Post 03 — Code checks   (read the blog post first: 03-code-checks/README.md)
 *
 * Scores hand-written app results with checks.ts, so you can see exactly what each check
 * catches, and what it misses. No model, no retrieval: just functions over strings.
 *
 * Run: npx tsx 03-code-checks/example.ts
 */
import { dump, section } from '@learn/shared';
import { cases } from '../02-golden-dataset/dataset.ts';
import { codeChecks, containsAny, type AppResult } from './checks.ts';

const byId = (id: string) => cases.find((c) => c.id === id)!;
const ok = { answerable: true, citationsValid: true };

section('Whole words only');
console.log('containsAny("Leave by noon", ["no"]) →', containsAny('Leave by noon', ['no'])); // false: "no" is inside "noon"
console.log('containsAny("No, it is not allowed", ["no"]) →', containsAny('No, it is not allowed', ['no']));

const examples: { label: string; id: string; result: AppResult }[] = [
  {
    label: 'correct',
    id: 'noshow-deposit',
    result: { ...ok, answer: 'After three no-shows in 12 months a SAR 100 deposit is required [1].', sources: ['appointment-cancellation.md'] },
  },
  {
    label: 'forgot the amount',
    id: 'noshow-deposit',
    result: { ...ok, answer: 'After three no-shows a deposit is required [1].', sources: ['appointment-cancellation.md'] },
  },
  {
    label: 'invented a fee',
    id: 'parking',
    result: { ...ok, answer: 'Parking costs SAR 5 per hour [2].', sources: ['visiting-hours.md'] },
  },
  {
    label: 'refused correctly',
    id: 'parking',
    result: { answer: 'I do not know.', answerable: false, citationsValid: true, sources: ['visiting-hours.md'] },
  },
  {
    label: 'wrong retrieval',
    id: 'discharge-time',
    result: { ...ok, answer: 'By 13:00 [1].', sources: ['visiting-hours.md', 'telehealth.md', 'medication-refill.md'] },
  },
  {
    label: 'meaning flipped (from lesson 04, post 08)',
    id: 'icu-children',
    result: { ...ok, answer: 'Yes, children under 12 can visit the ICU, provided they are approved by the charge nurse [1].', sources: ['visiting-hours.md'] },
  },
];

const shown = new Set<string>();
for (const { label, id, result } of examples) {
  section(`${id}: ${label}`);
  if (!shown.has(id)) {
    shown.add(id);
    // The golden case these answers are checked against (once per case). Notice which fields are
    // missing: a check whose field is absent returns null ("doesn't apply"), not true.
    dump(`golden case ${id}`, byId(id));
  }
  console.log(`  "${result.answer}"`);
  console.log(`  ${JSON.stringify(codeChecks(byId(id), result))}`);
}
