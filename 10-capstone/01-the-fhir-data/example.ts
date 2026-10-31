/**
 * Post 01 — The FHIR-shaped data.
 * Looks at the fictional clinic data the capstone works on, and why tools should return
 * small "projections" of FHIR resources instead of the raw resources.
 *
 *   npm run post:01      (no model needed)
 */
import { dump, section } from '@learn/shared';
import { appointments, bookSlot, displayName, medications, patients, slots } from './fhir-store.ts';

// 1. A raw FHIR Patient resource: nested, verbose, and full of identifiers.
section('[A] One raw FHIR Patient resource');
const fatima = patients[0]!;
console.log(JSON.stringify(fatima, null, 2));

// 2. A projection: only what a scheduling assistant needs. No national id, no phone.
section('[B] The same patient as a compact projection');
const projection = { id: fatima.id, name: displayName(fatima), birthYear: fatima.birthDate.slice(0, 4) };
console.log(projection);
console.log(`raw: ${JSON.stringify(fatima).length} characters · projection: ${JSON.stringify(projection).length} characters`);

// 3. Resources point at each other with references like "Patient/P-001", not by nesting.
section('[C] References link resources');
for (const m of medications) console.log(`  ${m.subject.reference.padEnd(14)} ${m.medicationCodeableConcept.text}`);

// 4. Writes change the in-memory store. The same slot can't be booked twice.
section('[D] Booking a slot');
console.log('free cardiology slots:', slots.filter((s) => s.status === 'free' && s.serviceType[0]?.text === 'cardiology').map((s) => s.id));
const appt = bookSlot('P-001', 'S-1', 'Blood-pressure follow-up');
// The full Appointment resource bookSlot() created. Notice `status: 'booked'`, and that the patient
// and the slot are references ("Patient/P-001", "Slot/S-1"), not copies.
dump('bookSlot() result', appt);
console.log(`booked ${appt.id}: ${appt.participant[0]!.actor.reference} → ${appt.slot[0]!.reference} at ${appt.start}`);
try {
  bookSlot('P-003', 'S-1', 'Chest pain review');
} catch (e) {
  console.log(`second booking of S-1 → ${(e as Error).message}`);
  // The error the store threw: a plain Error whose message says why the write was refused.
  dump('caught error', e);
}
console.log(`appointments in the store: ${appointments.length}`);
