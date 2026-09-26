import { COUNTED_SETS, TEMPO_DISTANCES } from './constants.js';

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

// What counts as a personal record for one entry (higher is better): the heaviest weight
// for weight x reps (for assisted sets, less assistance), the longest time for cardio.
// (Reps-only exercises compare the day's total reps instead; see sessionSummary.) For running: the longest easy run, and the fastest pace for
// tempo runs and for a single interval (pace is negated so that faster counts as higher).
function prMeasure(entry, kind) {
  if (kind === 'cardio') return entry.duration_min ?? 0;
  if (kind === 'reps') return entry.reps ?? 0;
  if (kind === 'running') {
    if (entry.run_type === 'easy') return entry.distance_km ?? 0;
    return -runPace(entry.duration_sec, entry.distance_km);
  }
  return entry.weight ?? 0;
}

// Records that are not comparable are kept apart. Barbell and dumbbell weights each have
// their own (older sets with no equipment recorded count as barbell, as on the charts).
// Each run type has its own, and tempo runs are compared only within 5K, 10K or other.
function prTrack(entry, kind) {
  if (kind === 'strength') return entry.equipment ?? 'barbell';
  if (kind === 'running') {
    if (entry.run_type !== 'tempo') return entry.run_type;
    const bucket = TEMPO_DISTANCES.find((d) => d.km && matchesTempoDistance(entry.distance_km, d.key));
    return `tempo-${bucket?.key ?? 'other'}`;
  }
  return '';
}

// One session: everything one person logged on one day, as { exerciseIds, prs, prEntryIds },
// with exercises in the order they were logged. `prs` lists the exercises where that session
// beat every earlier session by that person (see prMeasure). For reps-only exercises the
// record is the day's total reps (10 + 8 + 6 = 24) against every earlier day's total. A first
// ever session of an exercise sets a baseline, not a record. `prEntryIds` holds the set that
// made each record: the first set (by set number) to reach the session's best (none for
// reps-only, where the whole day made it). Used by the activity log and the Discord post.
export function sessionSummary(entries, exercises, personId, date) {
  const kindOf = new Map(exercises.map((e) => [e.id, e.kind]));
  const rows = entries.filter((e) => e.person_id === personId && e.date === date).sort((a, b) => a.id - b.id);
  const exerciseIds = [...new Set(rows.map((r) => r.exercise))];
  const prEntryIds = new Set();
  const prs = exerciseIds.filter((exerciseId) => {
    const kind = kindOf.get(exerciseId) ?? 'strength';
    if (kind === 'reps') {
      const total = rows.filter((r) => r.exercise === exerciseId).reduce((sum, r) => sum + (r.reps ?? 0), 0);
      const earlier = new Map(); // date -> that day's total reps
      for (const e of entries) {
        if (e.person_id === personId && e.exercise === exerciseId && e.date < date) {
          earlier.set(e.date, (earlier.get(e.date) ?? 0) + (e.reps ?? 0));
        }
      }
      return earlier.size > 0 && total > Math.max(...earlier.values());
    }
    const best = new Map(); // track -> the set with this session's best
    for (const r of [...rows].sort((a, b) => a.set_number - b.set_number)) {
      if (r.exercise !== exerciseId) continue;
      const track = prTrack(r, kind);
      const held = best.get(track);
      if (!held || prMeasure(r, kind) > prMeasure(held, kind)) best.set(track, r);
    }
    let isPr = false;
    for (const [track, top] of best) {
      let before = -Infinity;
      for (const e of entries) {
        if (e.person_id === personId && e.exercise === exerciseId && e.date < date && prTrack(e, kind) === track) {
          before = Math.max(before, prMeasure(e, kind));
        }
      }
      if (before > -Infinity && prMeasure(top, kind) > before) {
        isPr = true;
        prEntryIds.add(top.id);
      }
    }
    return isPr;
  });
  return { exerciseIds, prs, prEntryIds };
}

// The most recent sessions (one person, one day) for the activity log, by the date the
// session was for, newest first. Sessions on the same date put the one logged most recently
// (highest entry id) first, so a backdated entry slots in by its date, not when it was typed.
// Returns [{ personId, date, exerciseIds, prs }] (see sessionSummary).
export function recentSessions(entries, exercises, limit = 5) {
  const sessions = new Map();
  for (const e of entries) {
    const key = `${e.person_id}|${e.date}`;
    const s = sessions.get(key) ?? { personId: e.person_id, date: e.date, latest: 0 };
    s.latest = Math.max(s.latest, e.id);
    sessions.set(key, s);
  }

  const recent = [...sessions.values()]
    .sort((a, b) => (a.date === b.date ? b.latest - a.latest : a.date < b.date ? 1 : -1))
    .slice(0, limit);

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

// The body weight to divide by for one person on one day: the latest reading on or before
// that day, or, for days before their first reading, that first reading. null if they have
// never logged one. `bodyWeights` is [{ person_id, date, weight_kg }].
export function bodyWeightOn(bodyWeights, personId, date) {
  let before = null;
  let first = null;
  for (const b of bodyWeights) {
    if (b.person_id !== personId) continue;
    if (b.date <= date && (!before || b.date > before.date)) before = b;
    if (!first || b.date < first.date) first = b;
  }
  return (before ?? first)?.weight_kg ?? null;
}

// mode: 'total' | 'pct' | 'best' | 'bw'.
//   pct = % change in the best set's weight (as in 'best') from that person's first logged
//         day. Reps-only exercises use the best set's reps; cardio uses minutes.
//   bw  = the best set's weight divided by body weight (see bodyWeightOn), e.g. 1.25.
//         People with no body weight logged are left out. Reps-only and cardio charts have
//         no weight to divide, so they show the same as 'best'.
// options.equalise: count dumbbell sets at double weight (see factorFor).
// options.bodyWeights: [{ person_id, date, weight_kg }], needed for 'bw'.
// Returns rows shaped for a Recharts LineChart:
//   { t, date, p<id>: value | null, detail: { p<id>: sets } }
export function buildChartData(entries, exercise, mode, { equalise = false, bodyWeights = [] } = {}) {
  const summaries = dailySummaries(entries, exercise, mode === 'total' ? 'total' : 'best', { equalise });
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
    } else if (mode === 'bw' && exercise.kind === 'strength') {
      series = points
        .map((p) => {
          const bw = bodyWeightOn(bodyWeights, personId, p.date);
          return bw ? { ...p, value: Math.round((p.value / bw) * 100) / 100 } : null;
        })
        .filter(Boolean);
      if (series.length === 0) continue;
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

// The first date a chart shows for a range (see CHART_RANGES), or null for everything.
// '8w' is the Monday 7 weeks before this week's Monday, so 8 whole weeks including this one.
export function chartRangeStart(today, range) {
  const t = toTimestamp(today);
  const back = (days) => new Date(t - days * DAY_MS).toISOString().slice(0, 10);
  if (range === '8w') return back(((new Date(t).getUTCDay() + 6) % 7) + 7 * 7);
  if (range === '3m') return back(91);
  if (range === '6m') return back(182);
  if (range === '1y') return back(365);
  return null;
}

// A person's line breaks where they went more than this long between logged sessions, so
// separate stretches of training are not joined by one long line.
export const LINE_GAP_DAYS = 56;

// Splits each person's line into segments at gaps longer than `gapDays`. Returns the rows
// with each value also stored under a per-segment key (p<id>_<n>, with its hover detail
// copied alongside), and `lines`: [{ personId, key }], one per segment, to draw.
export function splitAtGaps(rows, personIds, gapDays = LINE_GAP_DAYS) {
  const out = rows.map((r) => ({ ...r, detail: { ...r.detail } }));
  const lines = [];
  for (const personId of personIds) {
    const key = seriesKey(personId);
    let segment = -1;
    let last = null;
    for (const row of out) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      if (last === null || row.t - last > gapDays * DAY_MS) {
        segment += 1;
        lines.push({ personId, key: `${key}_${segment}` });
      }
      last = row.t;
      row[`${key}_${segment}`] = value;
      if (row.detail[key]) row.detail[`${key}_${segment}`] = row.detail[key];
    }
  }
  return { rows: out, lines };
}

// `count` evenly spaced day timestamps from `from` to `to` ('YYYY-MM-DD'), for x-axis labels
// that are the same on every chart sharing that range.
export function evenTicks(from, to, count) {
  const start = toTimestamp(from);
  const end = toTimestamp(to);
  if (end <= start || count < 2) return [start];
  const ticks = [];
  for (let i = 0; i < count; i++) ticks.push(start + Math.round(((end - start) / (count - 1) / DAY_MS) * i) * DAY_MS);
  return [...new Set(ticks)];
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
  if (mode === 'bw' && kind === 'strength') return `${value.toFixed(2)}× BW`;
  const unit = kind === 'cardio' ? 'min' : kind === 'reps' ? 'reps' : 'kg';
  return `${round1(value).toLocaleString('en-GB')} ${unit}`;
}

// ---------- Running ----------

// Seconds per km.
export function runPace(seconds, km) {
  return km > 0 ? seconds / km : Infinity;
}

// 95 -> "1:35", 3725 -> "1:02:05".
export function formatDuration(totalSeconds) {
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// A pace in seconds per km as "4:50 /km".
export const formatPace = (secondsPerKm) => `${formatDuration(secondsPerKm)} /km`;

// Whether a tempo run's distance counts as the chosen 5K or 10K (within 5%). 'all' matches any.
export function matchesTempoDistance(km, key) {
  const target = TEMPO_DISTANCES.find((d) => d.key === key)?.km;
  if (!target) return true;
  return Math.abs(km - target) <= target * 0.05;
}

// Chart rows for the Running tile, for one run type, in the same shape as buildChartData:
//   easy:      the day's total distance, km.
//   tempo:     the day's fastest pace (seconds per km), only for runs matching tempoDistance.
//   intervals: the day's average pace across every interval: total time / total distance.
// detail[p<id>] lists that day's runs: [{ setNumber, distanceKm, seconds }].
export function runningChartData(entries, runType, { tempoDistance = '5k' } = {}) {
  const groups = new Map();
  for (const e of entries) {
    if (e.exercise !== 'running' || e.run_type !== runType) continue;
    if (runType === 'tempo' && !matchesTempoDistance(e.distance_km, tempoDistance)) continue;
    const key = `${e.person_id}|${e.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const perPerson = new Map();
  const allDates = new Set();
  for (const [key, runs] of groups) {
    const [personId, date] = key.split('|');
    const id = Number(personId);
    runs.sort((a, b) => a.set_number - b.set_number);
    let value;
    if (runType === 'easy') {
      value = Math.round(runs.reduce((sum, r) => sum + r.distance_km, 0) * 100) / 100;
    } else if (runType === 'tempo') {
      value = Math.min(...runs.map((r) => runPace(r.duration_sec, r.distance_km)));
    } else {
      const km = runs.reduce((sum, r) => sum + r.distance_km, 0);
      const seconds = runs.reduce((sum, r) => sum + r.duration_sec, 0);
      value = runPace(seconds, km);
    }
    const detail = runs.map((r) => ({ setNumber: r.set_number, distanceKm: r.distance_km, seconds: r.duration_sec }));
    if (!perPerson.has(id)) perPerson.set(id, new Map());
    perPerson.get(id).set(date, { value, detail });
    allDates.add(date);
  }

  const rows = [...allDates].sort().map((date) => {
    const row = { t: toTimestamp(date), date, detail: {} };
    for (const [personId, byDate] of perPerson) {
      const point = byDate.get(date);
      row[seriesKey(personId)] = point ? point.value : null;
      if (point) row.detail[seriesKey(personId)] = point.detail;
    }
    return row;
  });
  return { rows, personIds: [...perPerson.keys()] };
}
