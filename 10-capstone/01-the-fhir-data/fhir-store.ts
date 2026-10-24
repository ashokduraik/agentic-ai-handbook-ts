/**
 * A tiny FHIR-flavoured data store (R4 resource *shapes*, not a full FHIR server).
 * Real systems: HAPI FHIR / Azure Health Data Services / AWS HealthLake behind SMART-on-FHIR OAuth.
 * All data is fictional.
 */
export interface Patient {
  resourceType: 'Patient';
  id: string;
  identifier: { system: string; value: string }[];
  name: { family: string; given: string[] }[];
  birthDate: string;
  telecom: { system: 'phone'; value: string }[];
}
export interface AllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  patient: { reference: string };
  code: { text: string };
  criticality: 'low' | 'high';
}
export interface MedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'stopped';
  subject: { reference: string };
  medicationCodeableConcept: { text: string };
  dosageInstruction: { text: string }[];
}
export interface Slot {
  resourceType: 'Slot';
  id: string;
  status: 'free' | 'busy';
  serviceType: { text: string }[];
  start: string;
  end: string;
  comment: string; // practitioner name, for display
}
export interface Appointment {
  resourceType: 'Appointment';
  id: string;
  status: 'booked' | 'cancelled';
  slot: { reference: string }[];
  participant: { actor: { reference: string }; status: 'accepted' }[];
  description: string;
  start: string;
}

export const patients: Patient[] = [
  {
    resourceType: 'Patient', id: 'P-001',
    identifier: [{ system: 'urn:oid:sa-national-id', value: '1012345678' }],
    name: [{ family: 'Al-Harbi', given: ['Fatima'] }], birthDate: '1961-03-14',
    telecom: [{ system: 'phone', value: '0551234567' }],
  },
  {
    resourceType: 'Patient', id: 'P-002',
    identifier: [{ system: 'urn:oid:sa-iqama', value: '2098765432' }],
    name: [{ family: 'Menon', given: ['Rahul'] }], birthDate: '1988-11-02',
    telecom: [{ system: 'phone', value: '0559876543' }],
  },
  {
    resourceType: 'Patient', id: 'P-003',
    identifier: [{ system: 'urn:oid:sa-national-id', value: '1033344455' }],
    name: [{ family: 'Al-Qahtani', given: ['Fatima'] }], birthDate: '1990-07-21',
    telecom: [{ system: 'phone', value: '0501112233' }],
  },
];

export const allergies: AllergyIntolerance[] = [
  { resourceType: 'AllergyIntolerance', id: 'AL-1', patient: { reference: 'Patient/P-001' }, code: { text: 'Penicillin' }, criticality: 'high' },
];

export const medications: MedicationRequest[] = [
  { resourceType: 'MedicationRequest', id: 'MR-1', status: 'active', subject: { reference: 'Patient/P-001' }, medicationCodeableConcept: { text: 'Amlodipine 5 mg tablet' }, dosageInstruction: [{ text: 'Once daily' }] },
  { resourceType: 'MedicationRequest', id: 'MR-2', status: 'active', subject: { reference: 'Patient/P-001' }, medicationCodeableConcept: { text: 'Warfarin 3 mg tablet' }, dosageInstruction: [{ text: 'Once daily in the evening' }] },
  { resourceType: 'MedicationRequest', id: 'MR-3', status: 'active', subject: { reference: 'Patient/P-002' }, medicationCodeableConcept: { text: 'Ibuprofen 400 mg' }, dosageInstruction: [{ text: 'As needed, max 3/day' }] },
];

export const slots: Slot[] = [
  { resourceType: 'Slot', id: 'S-1', status: 'free', serviceType: [{ text: 'cardiology' }], start: '2026-10-25T09:00:00+03:00', end: '2026-10-25T09:20:00+03:00', comment: 'Dr. Salem' },
  { resourceType: 'Slot', id: 'S-2', status: 'free', serviceType: [{ text: 'cardiology' }], start: '2026-10-26T11:00:00+03:00', end: '2026-10-26T11:20:00+03:00', comment: 'Dr. Salem' },
  { resourceType: 'Slot', id: 'S-3', status: 'free', serviceType: [{ text: 'orthopedics' }], start: '2026-10-25T13:00:00+03:00', end: '2026-10-25T13:20:00+03:00', comment: 'Dr. Iyer' },
];

export const appointments: Appointment[] = [];

export const displayName = (p: Patient) => `${p.name[0]!.given.join(' ')} ${p.name[0]!.family}`;

export function bookSlot(patientId: string, slotId: string, description: string): Appointment {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) throw new Error(`Patient ${patientId} not found`);
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) throw new Error(`Slot ${slotId} not found`);
  if (slot.status !== 'free') throw new Error(`Slot ${slotId} is not free`);
  slot.status = 'busy';
  const appt: Appointment = {
    resourceType: 'Appointment', id: `APT-${appointments.length + 1}`, status: 'booked',
    slot: [{ reference: `Slot/${slot.id}` }], participant: [{ actor: { reference: `Patient/${patientId}` }, status: 'accepted' }],
    description, start: slot.start,
  };
  appointments.push(appt);
  return appt;
}
