import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { EQUIPMENT, EQUIPMENT_LABELS, MAX_EXERCISES, MAX_EXERCISE_NAME, MUSCLE_GROUPS } from '../lib/constants.js';
import { tidyExerciseName } from '../lib/names.js';

export default function AddExerciseDialog({ person, exercises, onClose, onCreated }) {
  const dialogRef = useRef(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('strength');
  const [muscleGroup, setMuscleGroup] = useState('');
  // Which equipment it can be done with. Two or more means each set says which was used.
  const [equipment, setEquipment] = useState([]);
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
    const clean = tidyExerciseName(name);
    if (!clean) {
      setError('Enter a name for the exercise.');
      return;
    }
    if (exercises.some((x) => x.name.toLowerCase() === clean.toLowerCase())) {
      setError('That exercise already exists.');
      return;
    }
    if (!repsOnly && !muscleGroup) {
      setError('Choose a muscle group.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const options = !repsOnly && equipment.length > 1 ? EQUIPMENT.filter((e) => equipment.includes(e)) : [];
      const created = await api.addExercise(clean, person.id, kind, options, repsOnly ? null : muscleGroup);
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
            spelling. It is saved in Title Case and singular
            {name.trim() ? <> (as &ldquo;{tidyExerciseName(name)}&rdquo;)</> : ''}. {exercises.length} of {MAX_EXERCISES} used.
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
          {repsOnly && <p className="hint">For bodyweight moves like pull-ups or push-ups. Weight is optional, for weighted sets.</p>}
        </fieldset>

        {!repsOnly && (
          <label className="field">
            Muscle group
            <select value={muscleGroup} disabled={busy} onChange={(e) => setMuscleGroup(e.target.value)} required>
              <option value="">Choose…</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <span className="hint">Used by the quick filters above the Weight training charts.</span>
          </label>
        )}

        {!repsOnly && (
          <fieldset className="equipment" disabled={busy}>
            <legend>Can be done with</legend>
            {EQUIPMENT.map((e) => (
              <label key={e}>
                <input
                  type="checkbox"
                  checked={equipment.includes(e)}
                  onChange={(event) =>
                    setEquipment((prev) => (event.target.checked ? [...prev, e] : prev.filter((x) => x !== e)))
                  }
                />
                {EQUIPMENT_LABELS[e]}
              </label>
            ))}
            <p className="hint">Tick two or more to log each set as one of them. Equalise doubles dumbbell weights.</p>
          </fieldset>
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
