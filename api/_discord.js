// Building the daily Discord post. Pure functions only, so they can be tested without a
// network or database. The endpoint that sends them is api/daily-discord.js.

import { formatDuration, lastSession, sessionSummary } from '../src/lib/metrics.js';
import { RUN_TYPES } from '../src/lib/constants.js';

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

// A Discord webhook URL: https://discord.com/api/webhooks/<id>/<token>. A link to a channel
// (discord.com/channels/...) is not one, and posting to it would look fine but go nowhere.
const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/;

export function isWebhookUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return WEBHOOK_RE.test(`${parsed.origin}${parsed.pathname}`);
  } catch {
    return false;
  }
}

// A link that opens a channel (or one message in it) in Discord.
export function discordLink(guildId, channelId, messageId) {
  return ['https://discord.com/channels', guildId ?? '@me', channelId, messageId].filter(Boolean).join('/');
}

// Names are typed by people in the group, so stop them being read as Discord formatting.
export const escapeMarkdown = (text) => String(text).replace(/([\\*_~`|])/g, '\\$1');

const number = (n) => Number(n).toLocaleString('en-GB');

// One set as the message shows it: "40kg x 10" (DB for dumbbells, minus for assisted),
// "12 reps", "30 min", or for a run "5km in 24:10".
function formatSet(row, kind) {
  if (kind === 'cardio') {
    const base = `${number(row.duration_min)} min`;
    return row.speed_kmh ? `${base} at ${number(row.speed_kmh)}km/h, ${number(row.incline_pct ?? 0)}% incline` : base;
  }
  if (kind === 'running') return `${number(row.distance_km)}km in ${formatDuration(row.duration_sec)}`;
  if (kind === 'reps') return `${row.reps} reps`;
  return `${number(row.weight)}kg x ${row.reps}${row.equipment === 'dumbbell' ? ' DB' : ''}`;
}

// An exercise in the list: just its name, or for a PR every set in order with the
// record-making set marked, "Shoulder press [PR! 34kg x 10, 🏆 40kg x 10, 40kg x 10]". A
// reps-only PR is the day's total instead: "Pull ups [PR! 🏆 24 Total daily reps]".
function exerciseText(exercise, rows, isPr, prEntryIds) {
  let name = escapeMarkdown(exercise.name);
  // Running says which kinds of run: "Running (easy, tempo)".
  if (exercise.kind === 'running') {
    const types = RUN_TYPES.filter((t) => rows.some((r) => r.run_type === t));
    if (types.length > 0) name += ` (${types.join(', ')})`;
  }
  if (!isPr) return name;
  if (exercise.kind === 'reps') {
    const total = rows.reduce((sum, r) => sum + (r.reps ?? 0), 0);
    return `${name} [PR! 🏆 ${total} Total daily reps]`;
  }
  const sets = [...rows]
    .sort((a, b) => a.set_number - b.set_number)
    .map((r) => `${prEntryIds.has(r.id) ? '🏆 ' : ''}${formatSet(r, exercise.kind)}`);
  return `${name} [PR! ${sets.join(', ')}]`;
}

// More reps than last time at the same weight (and equipment): of today's sets (`rows`) that
// beat the most reps done at that weight last session (`lastRows`), the heaviest, then the
// biggest gain. Returns { row, gain } or null.
export function repGain(rows, lastRows) {
  const kit = (r) => r.equipment ?? 'barbell';
  let best = null;
  for (const r of rows) {
    const before = lastRows.filter((l) => l.weight === r.weight && kit(l) === kit(r));
    if (before.length === 0) continue;
    const gain = r.reps - Math.max(...before.map((l) => l.reps));
    if (gain <= 0) continue;
    if (!best || r.weight > best.row.weight || (r.weight === best.row.weight && gain > best.gain)) best = { row: r, gain };
  }
  return best;
}

// One Discord webhook payload per person who logged anything on `date`, in the order
// people joined. Without a PR it is one line:
//   "Sam worked out today ✅ -> Bench press, Squat, Seated row."
// With any PR, or more reps than last time at the same weight, each exercise goes on its own
// bulleted line:
//   Sam worked out today ✅ ->
//   * Pull ups [PR! 🏆 24 Total daily reps]
//   * Shoulder press [PR! 34kg x 10, 🏆 40kg x 10, 40kg x 10]
//   * Bench press [⬆️ 60kg x 10 (+2 reps)]
//   * Seated row
// The ⬆️ line is for weight exercises without a PR that day (see repGain).
// PRs use the same rule as the activity log. Returns [{ personId, payload }].
export function buildDailyMessages({ people, exercises, entries, date }) {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const messages = [];

  for (const person of [...people].sort((a, b) => a.id - b.id)) {
    const { exerciseIds, prs, prEntryIds } = sessionSummary(entries, exercises, person.id, date);
    if (exerciseIds.length === 0) continue;

    let gains = 0;
    const list = exerciseIds.map((id) => {
      const exercise = exerciseById.get(id) ?? { id, name: id, kind: 'strength' };
      const rows = entries.filter((e) => e.person_id === person.id && e.date === date && e.exercise === id);
      const isPr = prs.includes(id);
      if (!isPr && exercise.kind === 'strength') {
        const last = lastSession(entries, person.id, id, date);
        const gain = last && repGain([...rows].sort((a, b) => a.set_number - b.set_number), last.rows);
        if (gain) {
          gains += 1;
          return `${escapeMarkdown(exercise.name)} [⬆️ ${formatSet(gain.row, exercise.kind)} (+${gain.gain} ${gain.gain === 1 ? 'rep' : 'reps'})]`;
        }
      }
      return exerciseText(exercise, rows, isPr, prEntryIds);
    });
    const opening = `${escapeMarkdown(person.name)} worked out today ✅ ->`;
    const bulleted = prs.length > 0 || gains > 0;

    messages.push({
      personId: person.id,
      payload: {
        username: 'FRIFT',
        allowed_mentions: { parse: [] }, // never ping anyone, whatever a name contains
        content: bulleted ? `${opening}\n${list.map((line) => `* ${line}`).join('\n')}` : `${opening} ${list.join(', ')}.`,
      },
    });
  }
  return messages;
}
