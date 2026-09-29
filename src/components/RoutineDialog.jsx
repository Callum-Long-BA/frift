import { useEffect, useRef, useState } from 'react';
import { MUSCLE_GROUPS } from '../lib/constants.js';

// Create or edit one of your routines: its name and which exercises it includes, grouped the
// way the page is. An existing routine can also be copied to someone else, or deleted.
export default function RoutineDialog({ person, people, exercises, routine, onClose, onSave, onDelete, onCopy }) {
  const dialogRef = useRef(null);
  const [name, setName] = useState(routine?.name ?? '');
  const [picked, setPicked] = useState(() => new Set(routine?.exercise_ids ?? []));
  const [copyTo, setCopyTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const closeDialog = () => dialogRef.current?.close();

  const groups = [
    ...MUSCLE_GROUPS.map((g) => ({ label: g.label, items: exercises.filter((e) => e.kind === 'strength' && e.muscle_group === g.key) })),
    { label: 'Other weights', items: exercises.filter((e) => e.kind === 'strength' && !MUSCLE_GROUPS.some((g) => g.key === e.muscle_group)) },
    { label: 'Cardio & calisthenics', items: exercises.filter((e) => e.kind !== 'strength') },
  ].filter((g) => g.items.length > 0);

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return setError('Give the routine a name.');
    if (picked.size === 0) return setError('Tick at least one exercise.');
    await run(async () => {
      await onSave(routine, clean, [...picked]);
      closeDialog();
    });
  }

  const others = people.filter((p) => p.id !== person.id);

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-labelledby="routine-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog();
      }}
    >
      <form className="sheet" onSubmit={save}>
        <header className="sheet-head">
          <div>
            <h2 id="routine-dialog-title">{routine ? 'Edit routine' : 'New routine'}</h2>
            <p className="sheet-sub">
              <span className="swatch" style={{ background: person.colour }} aria-hidden="true" />
              {person.name}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={closeDialog}>
            ×
          </button>
        </header>

        <label className="field">
          Name
          <input type="text" maxLength={30} placeholder="Push Day" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <fieldset className="routine-pick" disabled={busy}>
          <legend>
            Exercises <span className="hint">({picked.size} picked)</span>
          </legend>
          {groups.map((g) => (
            <div key={g.label} className="routine-group">
              <p className="routine-group-name">{g.label}</p>
              {g.items.map((e) => (
                <label key={e.id} className="routine-item">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
          ))}
        </fieldset>

        {routine && others.length > 0 && (
          <div className="routine-copy-to">
            <label className="field">
              Copy to
              <select value={copyTo} disabled={busy} onChange={(e) => setCopyTo(e.target.value)}>
                <option value="">Choose someone…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ghost"
              disabled={busy || !copyTo}
              onClick={() =>
                run(async () => {
                  const copy = await onCopy(routine.id, Number(copyTo));
                  setNotice(`Copied to ${others.find((p) => p.id === Number(copyTo))?.name} as “${copy.name}”.`);
                  setCopyTo('');
                })
              }
            >
              Copy
            </button>
          </div>
        )}
        {routine && <p className="hint">Copying saves the routine as it is now, not with unsaved changes.</p>}

        {notice && <p className="hint" role="status">{notice}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions">
          {routine && (
            <button
              type="button"
              className="text-btn danger routine-delete"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await onDelete(routine);
                  closeDialog();
                })
              }
            >
              Delete routine
            </button>
          )}
          <button type="button" className="ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : routine ? 'Save' : 'Create routine'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
