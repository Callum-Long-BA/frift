import { useMemo } from 'react';
import { dayLabel, recentSessions } from '../lib/metrics.js';

const SHOWN = 5;

// The latest sessions (one person, one day), by the date they were for, newest first. The line below each
// says how many personal records that session set, and in which exercises.
export default function ActivityLog({ people, entries, exercises }) {
  const sessions = useMemo(() => recentSessions(entries, exercises, SHOWN), [entries, exercises]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const exerciseName = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const names = (ids) => ids.map((id) => exerciseName.get(id) ?? id).join(', ');

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
            return (
              <li key={`${s.personId}|${s.date}`}>
                <p className="log-line" title={names(s.exerciseIds)}>
                  <span className="swatch" style={{ background: person?.colour }} aria-hidden="true" />
                  <span className="log-name">{person?.name ?? 'Someone'}</span>
                  <span className="log-date">{dayLabel(s.date)}</span>
                  <span className="log-what">{names(s.exerciseIds)}</span>
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
