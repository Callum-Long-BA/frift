import { COUNTED_SETS } from './constants.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const seriesKey = (personId) => `p${personId}`;

const round1 = (n) => Math.round(n * 10) / 10;

export function toTimestamp(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function todayString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The set number the next logged set will get (matches what the API assigns).
export function nextSetNumber(entries, personId, exerciseId, date) {
  let highest = 0;
  for (const e of entries) {
    if (
      e.person_id === personId &&
      e.exercise === exerciseId &&
      e.date === date &&
      e.set_number > highest
    ) {
      highest = e.set_number;
    }
  }
  return highest + 1;
}

// A dumbbell set is entered as the weight of ONE dumbbell. With "equalise" on it is
// counted at double, so it can be compared with a barbell. Sets with no equipment
// recorded (older entries, or exercises with no choice) count as barbell.
const factorFor = (row, equalise) => (equalise && row.equipment === 'dumbbell' ? 2 : 1);

// Map<personId, Map<'YYYY-MM-DD', { value, sets }>>
//
// mode 'total' (default):
//   value = sum of weight x reps over the LAST 3 sets (by set number) of the day.
// mode 'best':
//   value = the single set with the highest weight x reps that day, from ALL sets.
// Cardio is minutes in either mode and has no sets.
//
// `sets` lists every set that day, with `counts: true` on the sets that
// contributed to `value` in this mode (used to fade the others in the tooltip).
// `weight` is always the weight as logged; `factor` is 2 for equalised dumbbell sets.
export function dailySummaries(entries, exercise, mode = 'total', { equalise = false } = {}) {
  const groups = new Map();
  for (const e of entries) {
    if (e.exercise !== exercise.id) continue;
    const key = `${e.person_id}|${e.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const summaries = new Map();
  for (const [key, rows] of groups) {
    const [personId, date] = key.split('|');
    let value;
    let sets = [];

    if (exercise.kind === 'cardio') {
      value = rows.reduce((sum, r) => sum + (r.duration_min ?? 0), 0);
    } else {
      rows.sort((a, b) => a.set_number - b.set_number);
      sets = rows.map((r) => ({
        setNumber: r.set_number,
        weight: r.weight,
        reps: r.reps,
        equipment: r.equipment ?? null,
        factor: factorFor(r, equalise),
        counts: false,
      }));
      const volume = (s) => s.weight * s.factor * s.reps;

      if (mode === 'best') {
        let bestIndex = 0;
        let bestValue = -Infinity;
        sets.forEach((s, i) => {
          const v = volume(s);
          if (v > bestValue) {
            bestValue = v;
            bestIndex = i;
          }
        });
        sets[bestIndex].counts = true;
        value = bestValue;
      } else {
        const counted = sets.slice(-COUNTED_SETS);
        counted.forEach((s) => {
          s.counts = true;
        });
        value = counted.reduce((sum, s) => sum + volume(s), 0);
      }
    }

    const id = Number(personId);
    if (!summaries.has(id)) summaries.set(id, new Map());
    summaries.get(id).set(date, { value, sets });
  }
  return summaries;
}

// mode: 'total' | 'pct' | 'best'.
//   pct = % change in the total from that person's first logged day.
// options.equalise: count dumbbell sets at double weight (see factorFor).
// Returns rows shaped for a Recharts LineChart:
//   { t, date, p<id>: value | null, detail: { p<id>: sets } }
export function buildChartData(entries, exercise, mode, { equalise = false } = {}) {
  const summaries = dailySummaries(entries, exercise, mode === 'best' ? 'best' : 'total', { equalise });
  const perPerson = new Map();
  const allDates = new Set();

  for (const [personId, byDate] of summaries) {
    const points = [...byDate]
      .map(([date, summary]) => ({ date, ...summary }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let series = points;
    if (mode === 'pct') {
      const base = points[0].value;
      if (!(base > 0)) continue; // change from zero is undefined
      series = points.map((p) => ({ ...p, value: round1((p.value / base - 1) * 100) }));
    }

    perPerson.set(personId, new Map(series.map((p) => [p.date, p])));
    for (const p of series) allDates.add(p.date);
  }

  const rows = [...allDates].sort().map((date) => {
    const row = { t: toTimestamp(date), date, detail: {} };
    for (const [personId, byDate] of perPerson) {
      const point = byDate.get(date);
      row[seriesKey(personId)] = point ? point.value : null;
      if (point && point.sets.length > 0) row.detail[seriesKey(personId)] = point.sets;
    }
    return row;
  });

  return { rows, personIds: [...perPerson.keys()] };
}

// Up to `max` evenly spread x-axis ticks, always on real logged dates.
export function pickTicks(rows, max = 4) {
  if (rows.length === 0) return undefined;
  if (rows.length <= max) return rows.map((r) => r.t);
  const ticks = [];
  for (let i = 0; i < max; i++) {
    ticks.push(rows[Math.round((i * (rows.length - 1)) / (max - 1))].t);
  }
  return [...new Set(ticks)];
}

export function formatDay(t) {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatDayLong(t) {
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatAmount(value, mode, kind) {
  if (mode === 'pct') return `${value > 0 ? '+' : ''}${value}%`;
  return `${round1(value).toLocaleString('en-GB')} ${kind === 'cardio' ? 'min' : 'kg'}`;
}
