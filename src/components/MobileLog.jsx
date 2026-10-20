import { useState } from 'react';
import { MUSCLE_GROUPS, equipmentTag } from '../lib/constants.js';
import { dayLabel, lastSession, todayString } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import { cardioText } from './CardioChart.jsx';
import { runText } from './RunningChart.jsx';

// One line of sets as text: "60×8, 62.5×6", "12, 10 reps", or a cardio session or run.
function setsText(exercise, rows) {
  if (exercise.kind === 'cardio') return rows.map((r) => cardioText(r.duration_min, r.speed_kmh, r.incline_pct)).join('; ');
  if (exercise.kind === 'running') return rows.map((r) => runText({ distanceKm: r.distance_km, seconds: r.duration_sec }, exercise.id)).join(', ');
  if (exercise.kind === 'reps') return `${rows.map((r) => (r.weight == null ? r.reps : `${r.weight}×${r.reps}`)).join(', ')} reps`;
  return rows.map((r) => `${r.weight}×${r.reps}${equipmentTag(r.equipment)}`).join(', ');
}

const FILTER_KEY = 'frift.mobileFilter';

// Which filter an exercise falls under: its muscle group, 'other' for a weight exercise
// without one, or 'cc' for cardio, running and reps-only exercises.
const filterOf = (e) => (e.kind !== 'strength' ? 'cc' : e.muscle_group ?? 'other');

// The simple phone view: 1) who are you, 2) which routine, 3) log each of its exercises.
// Each exercise shows what you have logged today, or else what you did last time, and a big
// Log button that opens the usual log dialog. Exercises logged today move to the top. With
// no routine chosen, filter buttons narrow the list to one muscle group (or cardio and
// calisthenics). "Full view" switches to the whole board.
export default function MobileLog({
  people,
  me,
  onSelect,
  routines,
  activeRoutine,
  onPickRoutine,
  onNewRoutine,
  exercises,
  entries,
  status,
  error,
  onRetry,
  onLog,
  onFullView,
  noteFor = () => null,
  onSwitchGroup,
}) {
  const today = todayString();
  const mine = me ? routines.filter((r) => r.person_id === me.id) : [];
  const [filter, setFilter] = useState(() => readStored(FILTER_KEY) || 'all');
  function changeFilter(next) {
    setFilter(next);
    writeStored(FILTER_KEY, next);
  }

  // Only the filters that have exercises, in the full view's order.
  const filters = [
    { key: 'all', label: 'All' },
    ...MUSCLE_GROUPS.filter((g) => exercises.some((e) => filterOf(e) === g.key)),
    ...(exercises.some((e) => filterOf(e) === 'other') ? [{ key: 'other', label: 'Other' }] : []),
    ...(exercises.some((e) => filterOf(e) === 'cc') ? [{ key: 'cc', label: 'Cardio & calisthenics' }] : []),
  ];
  const activeFilter = !activeRoutine && filters.some((f) => f.key === filter) ? filter : 'all';

  // Each exercise with today's sets (or else last time's), those done today first. sort is
  // stable, so each half keeps the page's order.
  const items = me
    ? exercises
        .filter((e) => activeFilter === 'all' || filterOf(e) === activeFilter)
        .map((exercise) => {
          const todayRows = entries
            .filter((e) => e.person_id === me.id && e.exercise === exercise.id && e.date === today)
            .sort((a, b) => a.set_number - b.set_number);
          const last = todayRows.length === 0 ? lastSession(entries, me.id, exercise.id, today) : null;
          return { exercise, todayRows, last };
        })
        .sort((a, b) => Number(b.todayRows.length > 0) - Number(a.todayRows.length > 0))
    : [];

  return (
    <div className="mobile-log">
      <header className="mobile-head">
        <h1 className="wordmark">
          <em>FRIFT</em>
        </h1>
        {onSwitchGroup && (
          <button type="button" className="text-btn change-group" onClick={onSwitchGroup}>
            Change group
          </button>
        )}
        <button type="button" className="ghost small" onClick={onFullView}>
          Full view
        </button>
      </header>

      <p className="watch-reminder" role="note">
        <span aria-hidden="true">⌚</span> Remember to record this workout on your watch too.
      </p>

      {status === 'error' && (
        <div className="banner" role="alert">
          <span>Could not load the data: {error}</span>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      <section className="mobile-step" aria-labelledby="step-who">
        <h2 id="step-who" className="mobile-step-title">
          <span className="step-no">1</span> Who are you?
        </h2>
        <select className="mobile-select" value={me?.id ?? ''} onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose your name</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {people.length === 0 && status === 'ready' && <p className="hint">No one yet. Add yourself in the full view.</p>}
      </section>

      {me && (
        <section className="mobile-step" aria-labelledby="step-routine">
          <h2 id="step-routine" className="mobile-step-title">
            <span className="step-no">2</span> Routine
          </h2>
          <div className="mobile-routines" role="group" aria-label="Routine">
            <button type="button" className="chip" aria-pressed={!activeRoutine} onClick={() => onPickRoutine(null)}>
              All exercises
            </button>
            {mine.map((r) => (
              <button key={r.id} type="button" className="chip" aria-pressed={activeRoutine?.id === r.id} onClick={() => onPickRoutine(r.id)}>
                {r.name}
              </button>
            ))}
            <button type="button" className="chip chip-new" onClick={onNewRoutine}>
              ＋ New routine
            </button>
          </div>
        </section>
      )}

      {me && (
        <section className="mobile-step" aria-labelledby="step-log">
          <h2 id="step-log" className="mobile-step-title">
            <span className="step-no">3</span> Log {activeRoutine ? activeRoutine.name : 'an exercise'}
          </h2>
          {status === 'loading' && exercises.length === 0 && <p className="hint">Loading…</p>}
          {!activeRoutine && filters.length > 2 && (
            <div className="mobile-filters" role="group" aria-label="Show exercises for">
              {filters.map((f) => (
                <button key={f.key} type="button" className="chip" aria-pressed={activeFilter === f.key} onClick={() => changeFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <ul className="mobile-exercises">
            {items.map(({ exercise, todayRows, last }) => {
              const note = noteFor(exercise.id);
              return (
                <li key={exercise.id} className={todayRows.length > 0 ? 'mobile-exercise is-done' : 'mobile-exercise'}>
                  <div className="mobile-exercise-text">
                    <p className="mobile-exercise-name">
                      {todayRows.length > 0 && <span aria-hidden="true">✓ </span>}
                      {exercise.name}
                    </p>
                    <p className="mobile-exercise-note">
                      {todayRows.length > 0
                        ? `Today: ${setsText(exercise, todayRows)}`
                        : last
                          ? `Last time (${dayLabel(last.date)}): ${setsText(exercise, last.rows)}`
                          : 'Not logged yet'}
                    </p>
                    {note && <p className="mobile-exercise-note is-note">📝 {note.note}</p>}
                  </div>
                  <button type="button" className="primary mobile-log-btn" onClick={() => onLog(exercise)} aria-label={`Log ${exercise.name}`}>
                    {todayRows.length > 0 ? 'Add' : 'Log'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
