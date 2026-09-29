import { MUSCLE_GROUPS } from './constants.js';
import { DAY_MS, toTimestamp } from './metrics.js';

// Suggested routines: combinations of exercises a person keeps doing on the same day.

export const SUGGEST_LOOKBACK_DAYS = 84; // only recent training (12 weeks) says what they do now
const SAME_DAY_TYPE = 0.5; // days this alike (Jaccard) count as the same kind of session
const ALREADY_HAVE = 0.8; // a routine this alike to a suggestion makes it unnecessary

// |A ∩ B| / |A ∪ B| for two sets of exercise ids.
export function similarity(a, b) {
  let both = 0;
  for (const x of a) if (b.has(x)) both += 1;
  const either = a.size + b.size - both;
  return either === 0 ? 0 : both / either;
}

const PUSH = new Set(['chest', 'shoulders', 'triceps']);
const PULL = new Set(['back', 'biceps']);

// A name from the muscle groups involved: "Push day", "Pull day", "Leg day", or the groups
// themselves, most exercises first ("Back, Biceps & Legs"). Cardio and reps-only exercises
// count as "Cardio" and "Calisthenics".
export function routineName(exerciseIds, exercises) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const counts = new Map();
  for (const id of exerciseIds) {
    const e = byId.get(id);
    if (!e) continue;
    let group;
    if (e.kind === 'strength') group = e.muscle_group ?? 'other';
    else if (e.kind === 'reps') group = 'calisthenics';
    else group = 'cardio';
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const groups = [...counts.keys()];
  if (groups.length > 0 && groups.every((g) => PUSH.has(g))) return 'Push day';
  if (groups.length > 0 && groups.every((g) => PULL.has(g))) return 'Pull day';
  if (groups.length === 1 && groups[0] === 'legs') return 'Leg day';
  const label = (g) => MUSCLE_GROUPS.find((m) => m.key === g)?.label ?? g[0].toUpperCase() + g.slice(1);
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => label(g));
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? 'Routine';
  return joined.length <= 30 ? joined : `${names.slice(0, 2).join(' & ')} +`.slice(0, 30);
}

// Up to `limit` suggestions for one person: [{ name, exerciseIds, days, lastDate }], most
// often repeated first. From their training days in the last SUGGEST_LOOKBACK_DAYS with at
// least 2 exercises, newest first, each day joins the most alike group of days (if alike
// enough) or starts a new one. A group seen on 2 or more days suggests the exercises done on
// at least half of those days (2 or more). Suggestions too like one of `routines` (theirs),
// or like each other, are left out, and names are kept unique.
export function suggestRoutines(entries, exercises, personId, today, routines = [], limit = 2) {
  const since = new Date(toTimestamp(today) - SUGGEST_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const known = new Set(exercises.map((e) => e.id));
  const days = new Map(); // date -> Set of exercise ids
  for (const e of entries) {
    if (e.person_id !== personId || e.date < since || e.date > today || !known.has(e.exercise)) continue;
    if (!days.has(e.date)) days.set(e.date, new Set());
    days.get(e.date).add(e.exercise);
  }

  const clusters = []; // { seed: Set, days: [{ date, ids }] }
  for (const [date, ids] of [...days].filter(([, ids]) => ids.size >= 2).sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    let best = null;
    let bestScore = SAME_DAY_TYPE;
    for (const c of clusters) {
      const score = similarity(ids, c.seed);
      if (score >= bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best) best.days.push({ date, ids });
    else clusters.push({ seed: ids, days: [{ date, ids }] });
  }

  const mine = routines.map((r) => new Set(r.exercise_ids));
  const suggestions = [];
  const taken = new Set(routines.map((r) => r.name.toLowerCase()));
  for (const c of clusters.filter((c) => c.days.length >= 2).sort((a, b) => b.days.length - a.days.length)) {
    const counts = new Map();
    for (const d of c.days) for (const id of d.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const core = new Set([...counts].filter(([, n]) => n >= c.days.length / 2).map(([id]) => id));
    if (core.size < 2) continue;
    if (mine.some((r) => similarity(core, r) >= ALREADY_HAVE)) continue;
    if (suggestions.some((s) => similarity(core, new Set(s.exerciseIds)) >= ALREADY_HAVE)) continue;

    let name = routineName(core, exercises);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${routineName(core, exercises).slice(0, 27)} ${n}`;
    taken.add(name.toLowerCase());
    // Keep the page's order: exercises in the order they were added.
    const exerciseIds = exercises.map((e) => e.id).filter((id) => core.has(id));
    suggestions.push({ name, exerciseIds, days: c.days.length, lastDate: c.days[0].date });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
