import { dayLabel, lastSession, todayString } from '../lib/metrics.js';
import { cardioText } from './CardioChart.jsx';
import { runText } from './RunningChart.jsx';

// One line of sets as text: "60×8, 62.5×6", "12, 10 reps", or a cardio session or run.
function setsText(exercise, rows) {
  if (exercise.kind === 'cardio') return rows.map((r) => cardioText(r.duration_min, r.speed_kmh, r.incline_pct)).join('; ');
  if (exercise.kind === 'running') return rows.map((r) => runText({ distanceKm: r.distance_km, seconds: r.duration_sec })).join(', ');
  if (exercise.kind === 'reps') return `${rows.map((r) => r.reps).join(', ')} reps`;
  return rows.map((r) => `${r.weight}×${r.reps}${r.equipment === 'dumbbell' ? ' DB' : ''}`).join(', ');
}

// The simple phone view: 1) who are you, 2) which routine, 3) log each of its exercises.
// Each exercise shows what you have logged today, or else what you did last time, and a big
// Log button that opens the usual log dialog. "Full view" switches to the whole board.
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
}) {
  const today = todayString();
  const mine = me ? routines.filter((r) => r.person_id === me.id) : [];

  return (
    <div className="mobile-log">
      <header className="mobile-head">
        <h1 className="wordmark">
          <em>FRIFT</em>
        </h1>
        <button type="button" className="ghost small" onClick={onFullView}>
          Full view
        </button>
      </header>

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
          <ul className="mobile-exercises">
            {exercises.map((exercise) => {
              const todayRows = entries
                .filter((e) => e.person_id === me.id && e.exercise === exercise.id && e.date === today)
                .sort((a, b) => a.set_number - b.set_number);
              const last = todayRows.length === 0 ? lastSession(entries, me.id, exercise.id, today) : null;
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
