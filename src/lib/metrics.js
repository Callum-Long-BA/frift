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

// Map<personId, Map<'YYYY-MM-DD', number>>
// Strength: sum of weight x reps over the LAST 3 sets (by set number) of the day.
// Cardio: minutes.
export function dailyTotals(entries, exercise) {
  const groups = new Map();
  for (const e of entries) {
    if (e.exercise !== exercise.id) continue;
    const key = `${e.person_id}|${e.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const totals = new Map();
  for (const [key, rows] of groups) {
    const [personId, date] = key.split('|');
    let value;
    if (exercise.kind === 'cardio') {
      value = rows.reduce((sum, r) => sum + (r.duration_min ?? 0), 0);
    } else {
      rows.sort((a, b) => a.set_number - b.set_number);
      value = rows.slice(-COUNTED_SETS).reduce((sum, r) => sum + r.weight * r.reps, 0);
    }
    const id = Number(personId);
    if (!totals.has(id)) totals.set(id, new Map());
    totals.get(id).set(date, value);
  }
  return totals;
}

// mode: 'total' (raw value) or 'pct' (% change from that person's first logged day).
// Returns rows shaped for a Recharts LineChart: { t, date, p<id>: value | null }.
export function buildChartData(entries, exercise, mode) {
  const totals = dailyTotals(entries, exercise);
  const perPerson = new Map();
  const allDates = new Set();

  for (const [personId, byDate] of totals) {
    const points = [...byDate]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let series = points;
    if (mode === 'pct') {
      const base = points[0].value;
      if (!(base > 0)) continue; // change from zero is undefined
      series = points.map((p) => ({ date: p.date, value: round1((p.value / base - 1) * 100) }));
    }

    perPerson.set(personId, new Map(series.map((p) => [p.date, p.value])));
    for (const p of series) allDates.add(p.date);
  }

  const rows = [...allDates].sort().map((date) => {
    const row = { t: toTimestamp(date), date };
    for (const [personId, byDate] of perPerson) {
      row[seriesKey(personId)] = byDate.has(date) ? byDate.get(date) : null;
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
