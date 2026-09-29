import { useState } from 'react';

// The right-hand section of the top tile. Lists your routines; picking one filters the page
// to its exercises ("All exercises" clears it). You can start a new routine, edit the one
// you are using, or copy someone else's to yourself.
export default function RoutinesPanel({ me, people, routines, activeId, onPick, onNew, onEdit, onCopy }) {
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
