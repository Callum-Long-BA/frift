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

// The days shown in the activity strip: `weeks` full Monday-to-Sunday weeks, ending with
// the week that contains `today` (so days later this week are included, marked isFuture).
// today is 'YYYY-MM-DD'. Returns [{ date, week, dayOfWeek, isToday, isFuture }].
export function weekGrid(today, weeks = 3) {
  const t = toTimestamp(today);
  const mondayOffset = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const start = t - mondayOffset * DAY_MS - (weeks - 1) * 7 * DAY_MS;
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    return { date, week: Math.floor(i / 7), dayOfWeek: i % 7, isToday: date === today, isFuture: date > today };
  });
}

// Map<personId, Map<'YYYY-MM-DD', Set<exerciseId>>> for days between `from` and `to`.
// Any entry at all (a set or a cardio session) counts as having logged that day.
export function activityByPerson(entries, from, to) {
  const out = new Map();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    if (!out.has(e.person_id)) out.set(e.person_id, new Map());
    const byDate = out.get(e.person_id);
    if (!byDate.has(e.date)) byDate.set(e.date, new Set());
    byDate.get(e.date).add(e.exercise);
  }
  return out;
}

// What counts as a personal record for one entry: the heaviest weight for weight x reps,
// the most reps for reps-only, the longest time for cardio.
function prMeasure(entry, kind) {
  if (kind === 'cardio') return entry.duration_min ?? 0;
  if (kind === 'reps') return entry.reps ?? 0;
  return entry.weight ?? 0;
}

// Barbell and dumbbell weights are not comparable, so each has its own records.
// Older sets with no equipment recorded count as barbell, as they do on the charts.
const prTrack = (entry, kind) => (kind === 'strength' ? entry.equipment ?? 'barbell' : '');

// One session: everything one person logged on one day, as { exerciseIds, prs }, with
// exercises in the order they were logged. `prs` lists the exercises where that session
// beat every earlier session by that person (see prMeasure). A first ever session of an
// exercise sets a baseline, not a record. Used by the activity log and the Discord post.
export function sessionSummary(entries, exercises, personId, date) {
  const kindOf = new Map(exercises.map((e) => [e.id, e.kind]));
  const rows = entries.filter((e) => e.person_id === personId && e.date === date).sort((a, b) => a.id - b.id);
  const exerciseIds = [...new Set(rows.map((r) => r.exercise))];
  const prs = exerciseIds.filter((exerciseId) => {
    const kind = kindOf.get(exerciseId) ?? 'strength';
    const best = new Map(); // track -> this session's best
    for (const r of rows) {
      if (r.exercise !== exerciseId) continue;
      const track = prTrack(r, kind);
      best.set(track, Math.max(best.get(track) ?? -Infinity, prMeasure(r, kind)));
    }
    return [...best].some(([track, top]) => {
      let before = -Infinity;
      for (const e of entries) {
        if (e.person_id === personId && e.exercise === exerciseId && e.date < date && prTrack(e, kind) === track) {
          before = Math.max(before, prMeasure(e, kind));
        }
      }
      return before > -Infinity && top > before;
    });
  });
  return { exerciseIds, prs };
}

// The most recent sessions (one person, one day), newest logged first, for the activity log.
// "Newest" is by when it was logged (highest entry id), not by the date it was for.
// Returns [{ personId, date, exerciseIds, prs }] (see sessionSummary).
export function recentSessions(entries, exercises, limit = 5) {
  const sessions = new Map();
  for (const e of entries) {
    const key = `${e.person_id}|${e.date}`;
    const s = sessions.get(key) ?? { personId: e.person_id, date: e.date, latest: 0 };
    s.latest = Math.max(s.latest, e.id);
    sessions.set(key, s);
  }

  const recent = [...sessions.values()].sort((a, b) => b.latest - a.latest).slice(0, limit);

  return recent.map((s) => ({ personId: s.personId, date: s.date, ...sessionSummary(entries, exercises, s.personId, s.date) }));
}

export function dayLabel(date) {
  return new Date(toTimestamp(date)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
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
//   the best set is the one with the highest weight x reps that day, from ALL sets.
//   value = the WEIGHT of that set (doubled for equalised dumbbells).
//
// Reps-only exercises (kind 'reps') have no weight, so reps stand in for weight x reps:
// 'total' sums the reps of the last 3 sets and 'best' is the most reps in one set.
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
      const repsOnly = exercise.kind === 'reps';
      const volume = (s) => (repsOnly ? s.reps : s.weight * s.factor * s.reps);

      if (mode === 'best') {
        let bestIndex = 0;
        let bestVolume = -Infinity;
        sets.forEach((s, i) => {
          const v = volume(s);
          if (v > bestVolume) {
            bestVolume = v;
            bestIndex = i;
          }
        });
        const best = sets[bestIndex];
        best.counts = true;
        value = repsOnly ? best.reps : best.weight * best.factor;
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
  const unit = kind === 'cardio' ? 'min' : kind === 'reps' ? 'reps' : 'kg';
  return `${round1(value).toLocaleString('en-GB')} ${unit}`;
}
