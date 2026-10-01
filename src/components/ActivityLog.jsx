import { useMemo } from 'react';
import { dayLabel, recentSessions } from '../lib/metrics.js';
import { matchRoutine } from '../lib/routines.js';

const SHOWN = 5;

// The latest sessions (one person, one day), by the date they were for, newest first. Each
// says what was done: the routine it matches (one of that person's own, see matchRoutine)
// plus anything extra, or else the exercises; reps-only exercises show the day's total reps.
// The line below says how many personal records that session set, and in which exercises.
export default function ActivityLog({ people, entries, exercises, routines = [] }) {
  const sessions = useMemo(() => recentSessions(entries, exercises, SHOWN), [entries, exercises]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const exerciseName = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const kindOf = useMemo(() => new Map(exercises.map((e) => [e.id, e.kind])), [exercises]);
  const names = (ids) => ids.map((id) => exerciseName.get(id) ?? id).join(', ');

  // "Push Day + Leg extension · Pull ups 24 reps", or the exercises if no routine matches.
  function whatWasDone(s) {
    const routine = matchRoutine(s.exerciseIds, routines.filter((r) => r.person_id === s.personId));
    const inRoutine = new Set(routine?.exercise_ids ?? []);
    const repsOnly = s.exerciseIds.filter((id) => kindOf.get(id) === 'reps');
    const others = s.exerciseIds.filter((id) => kindOf.get(id) !== 'reps' && !inRoutine.has(id));
    const parts = [];
    if (routine) parts.push(others.length > 0 ? `${routine.name} + ${names(others)}` : routine.name);
    else if (others.length > 0) parts.push(names(others));
    const totals = repsOnly.map((id) => {
      const reps = entries
        .filter((e) => e.person_id === s.personId && e.date === s.date && e.exercise === id)
        .reduce((sum, e) => sum + (e.reps ?? 0), 0);
      return `${exerciseName.get(id) ?? id} ${reps} reps`;
    });
    if (totals.length > 0) parts.push(totals.join(', '));
    return { text: parts.join(' · '), isRoutine: Boolean(routine) };
  }

  return (
    <section className="control-section log" aria-labelledby="log-title">
      <h2 id="log-title" className="section-title">
        Activity log
      </h2>

      {sessions.length === 0 ? (
        <p className="section-note">Nothing logged yet.</p>
      ) : (
        <ol className="log-list">
          {sessions.map((s) => {
            const person = personById.get(s.personId);
            const what = whatWasDone(s);
            return (
              <li key={`${s.personId}|${s.date}`}>
                <p className="log-line" title={names(s.exerciseIds)}>
                  <span className="swatch" style={{ background: person?.colour }} aria-hidden="true" />
                  <span className="log-name">{person?.name ?? 'Someone'}</span>
                  <span className="log-date">{dayLabel(s.date)}</span>
                  <span className={what.isRoutine ? 'log-what is-routine' : 'log-what'}>{what.text}</span>
                </p>
                {s.prs.length > 0 ? (
                  <p className="log-prs" title={names(s.prs)}>
                    <span aria-hidden="true">🏆</span> {s.prs.length} {s.prs.length === 1 ? 'PR' : 'PRs'}: {names(s.prs)}
                  </p>
                ) : (
                  <p className="log-prs is-none">No new PRs</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
