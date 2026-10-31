# Post 01 · The FHIR-shaped data: resources, references and projections

*Series: [Lesson 10 — Capstone](../README.md) · Post 1 of 8 · about 15 minutes*

> The first version of the agent's "get patient" tool returned the full patient record. One call used 3,000 tokens, the model got lost in nested arrays, and the national ID and phone number ended up in the model's context, and from there in the logs and in one answer.

---

## The idea, in plain English

Hospitals exchange data in **FHIR** (Fast Healthcare Interoperability Resources), a standard from HL7. FHIR splits health data into **resources**, each with a `resourceType` and an `id`:

- **Patient**: name, birth date, identifiers (here a Saudi national ID or iqama), phone.
- **AllergyIntolerance**: what the patient reacts to, and how badly (`criticality`).
- **MedicationRequest**: an active prescription with dosing instructions.
- **Slot**: a free or busy time with a practitioner.
- **Appointment**: a booking that links a patient to a slot.

Resources don't nest each other. They point at each other with **references** such as `"Patient/P-001"`, the way a database uses foreign keys.

FHIR is built for completeness, so raw resources are verbose and full of identifiers. An agent rarely needs all that. So the tools in this capstone return **projections**: small objects with only the fields the task needs (an id, a display name, a birth year). That saves tokens, keeps the model focused, and means sensitive fields aren't in the model's context in the first place.

Our store, [`fhir-store.ts`](./fhir-store.ts), is a few in-memory arrays with FHIR R4 *shapes*. It isn't a FHIR server. Real systems use HAPI FHIR, Azure Health Data Services or AWS HealthLake behind SMART-on-FHIR OAuth. All the data is fictional.

---

## Let's see it in code

Open [`example.ts`](./example.ts). It only reads and writes the store; there's no model or server yet.

*About the imports:* the example uses helpers from `@learn/shared`, the course's small helper package. `section()` prints a bold heading in the output. [More about these helpers](../../shared/README.md).

### Step 1 — the resource types

```ts
export interface Patient {
  resourceType: 'Patient';
  id: string;
  identifier: { system: string; value: string }[];
  name: { family: string; given: string[] }[];
  birthDate: string;
  telecom: { system: 'phone'; value: string }[];
}
```

Names and identifiers are arrays, because a person can have several.

### Step 2 — a projection

```ts
// 2. A projection: only what a scheduling assistant needs. No national id, no phone.
section('[B] The same patient as a compact projection');
const projection = { id: fatima.id, name: displayName(fatima), birthYear: fatima.birthDate.slice(0, 4) };
```

### Step 3 — references

```ts
for (const m of medications) console.log(`  ${m.subject.reference.padEnd(14)} ${m.medicationCodeableConcept.text}`);
```

### Step 4 — a write that can fail

```ts
  if (slot.status !== 'free') throw new Error(`Slot ${slotId} is not free`);
  slot.status = 'busy';
```

Booking marks the slot busy, so the same slot can't be booked twice. Post 05 checks bookings by reading this store, never by trusting what the model says.

### Step 5 — look at what the write returned

The demo dumps the new Appointment and the refusal. `dump()` comes from `@learn/shared` ([how it prints](../../shared/README.md#dumplabel-value--print-the-full-returned-value)).

```ts
// The full Appointment resource bookSlot() created. Notice `status: 'booked'`, and that the patient
// and the slot are references ("Patient/P-001", "Slot/S-1"), not copies.
dump('bookSlot() result', appt);
```

```ts
  // The error the store threw: a plain Error whose message says why the write was refused.
  dump('caught error', e);
```

---

## Run it

From the lesson folder (`10-capstone/`):

```bash
npm run post:01           # no model needed
# or: npx tsx 01-the-fhir-data/example.ts
```

### What you should see

```
{ id: 'P-001', name: 'Fatima Al-Harbi', birthYear: '1961' }
raw: 238 characters · projection: 58 characters

  Patient/P-001  Amlodipine 5 mg tablet
  Patient/P-001  Warfarin 3 mg tablet
  Patient/P-002  Ibuprofen 400 mg

free cardiology slots: [ 'S-1', 'S-2' ]
▼ bookSlot() result
{
  resourceType: 'Appointment',
  id: 'APT-1',
  status: 'booked',
  slot: [ { reference: 'Slot/S-1' } ],
  participant: [ { actor: { reference: 'Patient/P-001' }, status: 'accepted' } ],
  description: 'Blood-pressure follow-up',
  start: '2026-10-25T09:00:00+03:00'
}
booked APT-1: Patient/P-001 → Slot/S-1 at 2026-10-25T09:00:00+03:00
second booking of S-1 → Slot S-1 is not free
▼ caught error
Error { name: 'Error', message: 'Slot S-1 is not free' }
  (hidden for readability: stack — set SHOW_RAW=1 to print everything)
appointments in the store: 1
```

The Appointment is a FHIR resource like the Patient: `participant[].actor.reference` points at the patient, `slot[].reference` at the slot, and `start` is copied from the slot. The output is the same on every run, because the store is rebuilt each time.

The projection is a quarter of the size, and has no national ID or phone number.

## Common gotchas

- ❌ **Returning raw FHIR bundles from tools.** Thousands of tokens, and every identifier goes to the model.
- ❌ **Treating the store as shared between runs.** It lives in the MCP server's process (post 02). A new process starts fresh, which is exactly what the evals in post 08 rely on.
- ❌ **Real patient data in a learning project.** Keep it fictional, even in "private" repos.
- ✅ Keep raw resources available to the *host app* (post 02 serves them as an MCP resource); give the *model* projections.

## Try it yourself

1. Add an `AllergyIntolerance` for Fatima Al-Qahtani (`P-003`) and print each patient's allergies by following the references.
2. Write `projectSlot(slot)` that returns `{ slotId, start, practitioner }`. Compare its size with the raw slot.
3. Add a `cancelAppointment(id)` function that frees the slot again.

## Key takeaways

- FHIR splits health data into **resources** linked by **references** (`"Patient/P-001"`).
- Tools should return **projections**: fewer tokens, less confusion, no identifiers the task doesn't need.
- The store is in-memory and fictional; real systems sit behind SMART-on-FHIR.

---

[← Previous: Lesson 09 — Deployment](../../09-deployment/README.md) · [📚 Series index](../README.md) · [Next: The MCP server →](../02-the-mcp-server/README.md)
