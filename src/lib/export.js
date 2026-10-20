import { runPace } from './metrics.js';

// One person's whole history as a CSV file: every set, cardio session and run, plus body
// weights and VO2 max scores, oldest first. One row per entry; columns that do not apply
// to a row are left blank.

const COLUMNS = [
  'date',
  'type',
  'exercise',
  'set',
  'weight_kg',
  'reps',
  'equipment',
  'minutes',
  'speed_kmh',
  'incline_pct',
  'run_type',
  'distance_km',
  'time_sec',
  'pace_sec_per_km',
  'body_weight_kg',
  'vo2max',
];

// Quote a field if it holds a comma, quote or line break.
function field(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv({ personId, entries, exercises, bodyWeights = [], vo2max = [] }) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const rows = [];
  for (const e of entries) {
    if (e.person_id !== personId) continue;
    const exercise = byId.get(e.exercise);
    const kind = exercise?.kind ?? 'strength';
    const row = { date: e.date, type: kind, exercise: exercise?.name ?? e.exercise, set: e.set_number, sort: e.id };
    if (kind === 'cardio') Object.assign(row, { minutes: e.duration_min, speed_kmh: e.speed_kmh, incline_pct: e.incline_pct });
    else if (kind === 'running') {
      Object.assign(row, {
        run_type: e.run_type,
        distance_km: e.distance_km,
        time_sec: e.duration_sec,
        pace_sec_per_km: Math.round(runPace(e.duration_sec, e.distance_km)),
      });
    } else Object.assign(row, { weight_kg: e.weight, reps: e.reps, equipment: e.equipment });
    rows.push(row);
  }
  for (const b of bodyWeights) {
    if (b.person_id === personId) rows.push({ date: b.date, type: 'body weight', body_weight_kg: b.weight_kg, sort: 0 });
  }
  for (const v of vo2max) {
    if (v.person_id === personId) rows.push({ date: v.date, type: 'vo2max', vo2max: v.value, sort: 0 });
  }
  rows.sort((a, b) => (a.date === b.date ? a.sort - b.sort : a.date < b.date ? -1 : 1));
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => field(r[c])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

// Hand the text to the browser as a file download.
export function downloadCsv(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
