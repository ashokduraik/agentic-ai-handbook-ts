/** A tiny in-memory "hospital scheduling API". Stands in for your real backend. Used by posts 02, 03 and 05-07. */
export type Department = 'cardiology' | 'orthopedics' | 'pediatrics' | 'general-medicine';
export interface Patient { id: string; name: string; dob: string }
export interface Slot { id: string; department: Department; doctor: string; start: string; free: boolean }
export interface Appointment { id: string; patientId: string; slotId: string; reason: string; status: 'booked' | 'cancelled' }

export const patients: Patient[] = [
  { id: 'P-001', name: 'Fatima Al-Harbi', dob: '1968-04-12' },
  { id: 'P-002', name: 'Rahul Menon', dob: '1990-09-30' },
];
export const slots: Slot[] = [
  { id: 'S-1', department: 'cardiology', doctor: 'Dr. Qureshi', start: '2026-11-03T09:30', free: true },
  { id: 'S-2', department: 'cardiology', doctor: 'Dr. Qureshi', start: '2026-11-04T11:00', free: true },
  { id: 'S-3', department: 'orthopedics', doctor: 'Dr. Lim', start: '2026-11-03T15:00', free: true },
];
export const appointments: Appointment[] = [];
let seq = 1;

export function book(patientId: string, slotId: string, reason: string): Appointment {
  const slot = slots.find((s) => s.id === slotId);
  if (!patients.some((p) => p.id === patientId)) throw new Error(`Unknown patient ${patientId}`);
  if (!slot) throw new Error(`Unknown slot ${slotId}`);
  if (!slot.free) throw new Error(`Slot ${slotId} is already taken`);
  slot.free = false;
  const appt: Appointment = { id: `A-${100 + seq++}`, patientId, slotId, reason, status: 'booked' };
  appointments.push(appt);
  return appt;
}
