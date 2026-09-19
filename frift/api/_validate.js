import { EXERCISES, MAX_SETS_PER_ENTRY } from '../src/lib/constants.js';
import { HttpError } from './_http.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Number('') is 0 and Number(null) is 0, which would let blanks through as zeros.
function toNumber(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  return Number(value);
}

export function parseId(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${label} is invalid.`);
  return n;
}

export function parseName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 24) throw new HttpError(400, 'Name must be 1 to 24 characters.');
  return name;
}

export function parseDate(value, now = new Date()) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new HttpError(400, 'Date must look like 2026-09-19.');
  }
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    throw new HttpError(400, 'That date does not exist.');
  }
  if (y < 2020) throw new HttpError(400, 'Date is too far in the past.');
  // Allow tomorrow in UTC so people in time zones ahead of UTC can log "today".
  const latest = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;
  if (parsed.getTime() > latest) throw new HttpError(400, 'Date cannot be in the future.');
  return value;
}

// Returns a normalised entry:
//   { kind: 'strength', personId, exercise, date, sets: [{ weight, reps }] }
//   { kind: 'cardio',   personId, exercise, date, durationMin }
export function parseNewEntry(body, now = new Date()) {
  const personId = parseId(body?.personId, 'Person');
  const exercise = EXERCISES.find((e) => e.id === body?.exercise);
  if (!exercise) throw new HttpError(400, 'Unknown exercise.');
  const date = parseDate(body?.date, now);

  if (exercise.kind === 'cardio') {
    const durationMin = toNumber(body?.durationMin);
    if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 600) {
      throw new HttpError(400, 'Cardio duration must be between 1 and 600 minutes.');
    }
    return { kind: 'cardio', personId, exercise: exercise.id, date, durationMin };
  }

  const rawSets = body?.sets;
  if (!Array.isArray(rawSets) || rawSets.length < 1 || rawSets.length > MAX_SETS_PER_ENTRY) {
    throw new HttpError(400, `Log between 1 and ${MAX_SETS_PER_ENTRY} sets at a time.`);
  }
  const sets = rawSets.map((s, i) => {
    const weight = toNumber(s?.weight);
    const reps = toNumber(s?.reps);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1000) {
      throw new HttpError(400, `Set ${i + 1}: weight must be between 0 and 1000 kg.`);
    }
    if (!Number.isInteger(reps) || reps < 1 || reps > 200) {
      throw new HttpError(400, `Set ${i + 1}: reps must be a whole number from 1 to 200.`);
    }
    return { weight, reps };
  });
  return { kind: 'strength', personId, exercise: exercise.id, date, sets };
}
