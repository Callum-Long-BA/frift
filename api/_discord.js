// Building the daily Discord post. Pure functions only, so they can be tested without a
// network or database. The endpoint that sends them is api/daily-discord.js.

import { sessionSummary } from '../src/lib/metrics.js';

// The date ('YYYY-MM-DD') and hour (0-23) in the UK right now, allowing for summer time.
export function londonNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// Names are typed by people in the group, so stop them being read as Discord formatting.
export const escapeMarkdown = (text) => String(text).replace(/([\\*_~`|])/g, '\\$1');

const number = (n) => Number(n).toLocaleString('en-GB');

// One set as the message shows it: "40kg x 10" (DB for dumbbells), "12 reps" or "30 min".
function formatSet(row, kind) {
  if (kind === 'cardio') return `${number(row.duration_min)} min`;
  if (kind === 'reps') return `${row.reps} reps`;
  return `${number(row.weight)}kg x ${row.reps}${row.equipment === 'dumbbell' ? ' DB' : ''}`;
}

// An exercise in the list: just its name, or for a PR every set in order, with the
// record-making set marked: "Shoulder press [PR! 34kg x 10, 40kg x 10 🏆, 40kg x 10]".
function exerciseText(exercise, rows, prEntryIds) {
  const name = escapeMarkdown(exercise.name);
  if (!rows.some((r) => prEntryIds.has(r.id))) return name;
  const sets = [...rows]
    .sort((a, b) => a.set_number - b.set_number)
    .map((r) => `${formatSet(r, exercise.kind)}${prEntryIds.has(r.id) ? ' 🏆' : ''}`);
  return `${name} [PR! ${sets.join(', ')}]`;
}

// One Discord webhook payload per person who logged anything on `date`, in the order
// people joined, each a single line:
//   "Sam worked out today ✅ -> Bench press, Squat, Shoulder press [PR! 34kg x 10, 40kg x 10 🏆, 40kg x 10], Seated row."
// PRs use the same rule as the activity log. Returns [{ personId, payload }].
export function buildDailyMessages({ people, exercises, entries, date }) {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const messages = [];

  for (const person of [...people].sort((a, b) => a.id - b.id)) {
    const { exerciseIds, prEntryIds } = sessionSummary(entries, exercises, person.id, date);
    if (exerciseIds.length === 0) continue;

    const list = exerciseIds.map((id) => {
      const exercise = exerciseById.get(id) ?? { id, name: id, kind: 'strength' };
      const rows = entries.filter((e) => e.person_id === person.id && e.date === date && e.exercise === id);
      return exerciseText(exercise, rows, prEntryIds);
    });

    messages.push({
      personId: person.id,
      payload: {
        username: 'FRIFT',
        allowed_mentions: { parse: [] }, // never ping anyone, whatever a name contains
        content: `${escapeMarkdown(person.name)} worked out today ✅ -> ${list.join(', ')}.`,
      },
    });
  }
  return messages;
}
