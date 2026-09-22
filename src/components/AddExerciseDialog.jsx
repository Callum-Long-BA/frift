import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { MAX_EXERCISES, MAX_EXERCISE_NAME } from '../lib/constants.js';

export default function AddExerciseDialog({ person, exercises, onClose, onCreated }) {
  const dialogRef = useRef(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('strength');
  const [equipmentChoice, setEquipmentChoice] = useState(false);
  const repsOnly = kind === 'reps';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const closeDialog = () => dialogRef.current?.close();

  async function submit(event) {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setError('Enter a name for the exercise.');
      return;
    }
    if (exercises.some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
      setError('That exercise already exists.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await api.addExercise(clean, person.id, kind, !repsOnly && equipmentChoice);
      onCreated(created);
      closeDialog();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-labelledby="exercise-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog();
      }}
    >
      <form className="sheet" onSubmit={submit}>
        <header className="sheet-head">
          <div>
            <h2 id="exercise-dialog-title">Add an exercise</h2>
            <p className="sheet-sub">
              <span className="swatch" style={{ background: person.colour }} aria-hidden="true" />
              {person.name}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={closeDialog}>
            ×
          </button>
        </header>

        <div className="field">
          <label htmlFor="exercise-name">Exercise name</label>
          <input
            id="exercise-name"
            type="text"
            maxLength={MAX_EXERCISE_NAME}
            placeholder="Romanian deadlift"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="hint">
            Everyone in the group will see it, and it cannot be removed from the app once added, so check the
            spelling. {exercises.length} of {MAX_EXERCISES} used.
          </p>
        </div>

        <fieldset className="equipment" disabled={busy}>
          <legend>Logged as</legend>
          <label>
            <input type="radio" name="kind" value="strength" checked={!repsOnly} onChange={() => setKind('strength')} />
            Weight × reps
          </label>
          <label>
            <input type="radio" name="kind" value="reps" checked={repsOnly} onChange={() => setKind('reps')} />
            Reps only
          </label>
          {repsOnly && <p className="hint">For bodyweight moves like pull-ups or push-ups. No weight is entered.</p>}
        </fieldset>

        {!repsOnly && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={equipmentChoice}
              disabled={busy}
              onChange={(e) => setEquipmentChoice(e.target.checked)}
            />
            <span>
              Can be done with a barbell or dumbbells
              <span className="hint"> Each set is logged as one or the other, and Equalise can double dumbbell weights.</span>
            </span>
          </label>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add exercise'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
