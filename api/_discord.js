// Building the daily Discord post. Pure functions only, so they can be tested without a
// network or database. The endpoint that sends them is api/daily-discord.js.

import { dayLabel, sessionSummary } from '../src/lib/metrics.js';
import { colourFor } from '../src/lib/theme.js';

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

const kg = (n) => `${Number(n).toLocaleString('en-GB')} kg`;

// One line per exercise, e.g. "**Bench press** · 60 kg × 8, 62.5 kg × 6 DB · 🏆 PR".
function exerciseLine(exercise, rows, isPr) {
  let detail;
  if (exercise.kind === 'cardio') {
    detail = `${rows.reduce((sum, r) => sum + (r.duration_min ?? 0), 0)} min`;
  } else {
    const sets = [...rows].sort((a, b) => a.set_number - b.set_number);
    detail =
      exercise.kind === 'reps'
        ? `${sets.map((r) => r.reps).join(', ')} reps`
        : sets.map((r) => `${kg(r.weight)} × ${r.reps}${r.equipment === 'dumbbell' ? ' DB' : ''}`).join(', ');
  }
  return `**${escapeMarkdown(exercise.name)}** · ${detail}${isPr ? ' · 🏆 PR' : ''}`;
}

// One Discord webhook payload per person who logged anything on `date`, in the order
// people joined. Each is an embed in that person's colour, listing every exercise with
// its sets, marking PRs (same rule as the activity log), with a PR count in the footer.
// Returns [{ personId, payload }].
export function buildDailyMessages({ people, exercises, entries, date }) {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const messages = [];

  for (const person of [...people].sort((a, b) => a.id - b.id)) {
    const { exerciseIds, prs } = sessionSummary(entries, exercises, person.id, date);
    if (exerciseIds.length === 0) continue;

    const lines = exerciseIds.map((id) => {
      const exercise = exerciseById.get(id) ?? { id, name: id, kind: 'strength' };
      const rows = entries.filter((e) => e.person_id === person.id && e.date === date && e.exercise === id);
      return exerciseLine(exercise, rows, prs.includes(id));
    });

    const footer =
      prs.length > 0 ? `🏆 ${prs.length} ${prs.length === 1 ? 'PR' : 'PRs'} today` : `${exerciseIds.length} ${exerciseIds.length === 1 ? 'exercise' : 'exercises'} logged`;

    messages.push({
      personId: person.id,
      payload: {
        username: 'FRIFT',
        allowed_mentions: { parse: [] }, // never ping anyone, whatever a name contains
        embeds: [
          {
            title: `${person.name} · ${dayLabel(date)}`,
            color: parseInt(colourFor(person.colour).slice(1), 16) || 0xe5322d,
            description: lines.join('\n'),
            footer: { text: footer },
          },
        ],
      },
    });
  }
  return messages;
}
