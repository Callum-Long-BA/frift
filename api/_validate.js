import { EQUIPMENT, MAX_EXERCISE_NAME, MAX_SETS_PER_ENTRY } from '../src/lib/constants.js';
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

export function parseExerciseName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > MAX_EXERCISE_NAME) {
    throw new HttpError(400, `Exercise name must be 1 to ${MAX_EXERCISE_NAME} characters.`);
  }
  return name;
}

// "Incline Bench Press!" -> "incline_bench_press". Accents are stripped.
export function slugify(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) throw new HttpError(400, 'Use at least one letter or number in the exercise name.');
  return slug;
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

// `exercises` is the list from the database: [{ id, kind, equipment_choice }].
// Returns a normalised entry:
//   { kind: 'strength', personId, exercise, date, equipment, sets: [{ weight, reps }] }
//   { kind: 'reps',     personId, exercise, date, equipment: null, sets: [{ weight: null, reps }] }
//   { kind: 'cardio',   personId, exercise, date, durationMin }
export function parseNewEntry(body, exercises, now = new Date()) {
  const personId = parseId(body?.personId, 'Person');
  const exercise = exercises.find((e) => e.id === body?.exercise);
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
  const repsOnly = exercise.kind === 'reps';
  const sets = rawSets.map((s, i) => {
    const reps = toNumber(s?.reps);
    if (repsOnly) {
      if (!Number.isInteger(reps) || reps < 1 || reps > 200) {
        throw new HttpError(400, `Set ${i + 1}: reps must be a whole number from 1 to 200.`);
      }
      return { weight: null, reps };
    }
    const weight = toNumber(s?.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1000) {
      throw new HttpError(400, `Set ${i + 1}: weight must be between 0 and 1000 kg.`);
    }
    if (!Number.isInteger(reps) || reps < 1 || reps > 200) {
      throw new HttpError(400, `Set ${i + 1}: reps must be a whole number from 1 to 200.`);
    }
    return { weight, reps };
  });

  // Exercises that allow a choice need to say barbell or dumbbell. Others store nothing.
  let equipment = null;
  if (exercise.equipment_choice && !repsOnly) {
    if (!EQUIPMENT.includes(body?.equipment)) throw new HttpError(400, 'Choose barbell or dumbbell.');
    equipment = body.equipment;
  }

  return { kind: repsOnly ? 'reps' : 'strength', personId, exercise: exercise.id, date, equipment, sets };
}
