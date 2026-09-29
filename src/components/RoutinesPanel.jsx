import { useState } from 'react';
import { dayLabel } from '../lib/metrics.js';

// The right-hand section of the top tile. Lists your routines; picking one filters the page
// to its exercises ("All exercises" clears it). You can start a new routine, edit the one
// you are using, or copy someone else's to yourself. Below them, up to two routines are
// suggested from exercises you keep doing together (see lib/routines.js); tapping one opens
// the new routine dialog already filled in.
export default function RoutinesPanel({ me, people, routines, activeId, suggestions = [], onPick, onNew, onEdit, onCopy, onSuggest }) {
  const [copyError, setCopyError] = useState('');
  const [copying, setCopying] = useState(false);

  if (!me) {
    return (
      <section className="control-section routines" aria-labelledby="routines-title">
        <h2 id="routines-title" className="section-title">
          Routines
        </h2>
        <p className="section-note">Choose who you are to use your routines.</p>
      </section>
    );
  }

  const mine = routines.filter((r) => r.person_id === me.id);
  const others = routines.filter((r) => r.person_id !== me.id);
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const active = mine.find((r) => r.id === activeId) ?? null;

  async function copyToMe(event) {
    const id = Number(event.target.value);
    event.target.value = '';
    if (!id) return;
    setCopying(true);
    setCopyError('');
    try {
      await onCopy(id, me.id);
    } catch (err) {
      setCopyError(err.message);
    } finally {
      setCopying(false);
    }
  }

  return (
    <section className="control-section routines" aria-labelledby="routines-title">
      <h2 id="routines-title" className="section-title">
        Routines
      </h2>

      <div className="routine-list" role="group" aria-label="Show a routine">
        <button type="button" className="chip" aria-pressed={!active} onClick={() => onPick(null)}>
          All exercises
        </button>
        {mine.map((r) => (
          <button key={r.id} type="button" className="chip" aria-pressed={active?.id === r.id} onClick={() => onPick(r.id)}>
            {r.name}
          </button>
        ))}
      </div>

      <div className="routine-actions">
        <button type="button" className="text-btn" onClick={onNew}>
          New routine
        </button>
        {active && (
          <button type="button" className="text-btn" onClick={() => onEdit(active)}>
            Edit “{active.name}”
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="routine-suggest">
          <p className="routine-suggest-label">Suggested from your logs</p>
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              className="suggest-btn"
              title={`${s.exerciseIds.length} exercises you did together on ${s.days} days, last on ${dayLabel(s.lastDate)}`}
              onClick={() => onSuggest(s)}
            >
              <span aria-hidden="true">＋</span> {s.name}
              <span className="suggest-meta">
                {s.exerciseIds.length} exercises · {s.days} days
              </span>
            </button>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <label className="routine-copy">
          <span>Copy from</span>
          <select className="dark-select" defaultValue="" disabled={copying} onChange={copyToMe}>
            <option value="">someone else’s routine…</option>
            {others.map((r) => (
              <option key={r.id} value={r.id}>
                {personName.get(r.person_id) ?? 'Someone'}: {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {copyError && (
        <p className="dark-error" role="alert">
          {copyError}
        </p>
      )}
    </section>
  );
}
