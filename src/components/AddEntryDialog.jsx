import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { COUNTED_SETS, MAX_SETS_PER_ENTRY } from '../lib/constants.js';
import { nextSetNumber, todayString } from '../lib/metrics.js';

export default function AddEntryDialog({ exercise, person, entries, onClose, onSaved, onDeleted }) {
  const dialogRef = useRef(null);
  const [date, setDate] = useState(() => todayString());
  const [sets, setSets] = useState([{ weight: '', reps: '' }]);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCardio = exercise.kind === 'cardio';
  const hasEquipment = exercise.equipment_choice === true && !isCardio;

  // Start on whatever this person used last time for this exercise, else barbell.
  const [equipment, setEquipment] = useState(() => {
    const previous = entries
      .filter((e) => e.person_id === person.id && e.exercise === exercise.id && e.equipment)
      .sort((a, b) => b.id - a.id)[0];
    return previous?.equipment ?? 'barbell';
  });
  const isDumbbell = hasEquipment && equipment === 'dumbbell';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const logged = useMemo(
    () =>
      entries
        .filter((e) => e.person_id === person.id && e.exercise === exercise.id && e.date === date)
        .sort((a, b) => a.set_number - b.set_number),
    [entries, person.id, exercise.id, date],
  );
  const firstNewSet = nextSetNumber(entries, person.id, exercise.id, date);
  const countedIds = new Set(logged.slice(-COUNTED_SETS).map((r) => r.id));
  const cardioDone = isCardio && logged.length > 0;

  const closeDialog = () => dialogRef.current?.close();

  function updateSet(index, patch) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSet() {
    // Start from the previous set, since most sets repeat the same weight.
    setSets((prev) => [...prev, { ...prev[prev.length - 1] }]);
  }

  function removeSet(index) {
    setSets((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    let payload;
    if (isCardio) {
      const durationMin = Number(minutes);
      if (minutes === '' || !(durationMin > 0)) {
        setError('Enter the duration in minutes.');
        return;
      }
      payload = { personId: person.id, exercise: exercise.id, date, durationMin };
    } else {
      const parsed = [];
      for (let i = 0; i < sets.length; i++) {
        const { weight, reps } = sets[i];
        const label = `Set ${firstNewSet + i}`;
        if (weight === '' || Number.isNaN(Number(weight)) || Number(weight) < 0) {
          setError(`${label}: enter a weight in kg.`);
          return;
        }
        if (!Number.isInteger(Number(reps)) || Number(reps) < 1) {
          setError(`${label}: enter reps as a whole number, 1 or more.`);
          return;
        }
        parsed.push({ weight: Number(weight), reps: Number(reps) });
      }
      payload = { personId: person.id, exercise: exercise.id, date, sets: parsed };
      if (hasEquipment) payload.equipment = equipment;
    }

    setBusy(true);
    try {
      const rows = await api.addEntry(payload);
      onSaved(rows);
      closeDialog();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove(row) {
    setError('');
    try {
      await api.deleteEntry(row.id, person.id);
      onDeleted(row.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const submitLabel = isCardio
    ? 'Save cardio'
    : `Save ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`;

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeDialog(); // click on the backdrop
      }}
    >
      <form className="sheet" onSubmit={submit}>
        <header className="sheet-head">
          <div>
            <h2 id="dialog-title">Log {exercise.name}</h2>
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
          Date
          <input
            type="date"
            value={date}
            min="2020-01-01"
            max={todayString()}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {hasEquipment && (
          <fieldset className="equipment" disabled={busy}>
            <legend>Equipment</legend>
            <label>
              <input
                type="radio"
                name="equipment"
                value="barbell"
                checked={equipment === 'barbell'}
                onChange={() => setEquipment('barbell')}
              />
              Barbell
            </label>
            <label>
              <input
                type="radio"
                name="equipment"
                value="dumbbell"
                checked={equipment === 'dumbbell'}
                onChange={() => setEquipment('dumbbell')}
              />
              Dumbbell
            </label>
            {isDumbbell && <p className="hint">Enter the weight of one dumbbell.</p>}
          </fieldset>
        )}

        {isCardio ? (
          <div className="field">
            <label htmlFor="minutes">Duration in minutes</label>
            <input
              id="minutes"
              type="number"
              inputMode="decimal"
              min="1"
              max="600"
              step="1"
              placeholder="30"
              value={minutes}
              disabled={cardioDone || busy}
              onChange={(e) => setMinutes(e.target.value)}
            />
            {cardioDone && <p className="hint">Cardio is already logged for this date. Delete it below to change it.</p>}
          </div>
        ) : (
          <fieldset className="sets" disabled={busy}>
            <legend>Sets to add</legend>
            {sets.map((s, i) => {
              const n = firstNewSet + i;
              return (
                <div className="set-row" key={i}>
                  <span className="set-label">Set {n}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="1000"
                    step="0.5"
                    placeholder={isDumbbell ? 'kg each' : 'kg'}
                    aria-label={`Set ${n} weight in kilograms${isDumbbell ? ', per dumbbell' : ''}`}
                    value={s.weight}
                    onChange={(e) => updateSet(i, { weight: e.target.value })}
                  />
                  <span className="times" aria-hidden="true">
                    ×
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="200"
                    step="1"
                    placeholder="reps"
                    aria-label={`Set ${n} reps`}
                    value={s.reps}
                    onChange={(e) => updateSet(i, { reps: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove set ${n}`}
                    disabled={sets.length === 1}
                    onClick={() => removeSet(i)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button type="button" className="text-btn" disabled={sets.length >= MAX_SETS_PER_ENTRY} onClick={addSet}>
              Add another set
            </button>
            <p className="hint">Only the last {COUNTED_SETS} sets of the day count toward the chart.</p>
          </fieldset>
        )}

        {logged.length > 0 && (
          <section aria-label="Already logged on this date">
            <h3>Already logged on this date</h3>
            <ul className="logged">
              {logged.map((row) => (
                <li key={row.id}>
                  <span>{isCardio ? `${row.duration_min} min` : `Set ${row.set_number}: ${row.weight} kg × ${row.reps}${row.equipment ? `, ${row.equipment}` : ''}`}</span>
                  {!isCardio && countedIds.has(row.id) && <span className="tag">counts</span>}
                  <button type="button" className="text-btn danger" onClick={() => remove(row)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
          <button type="submit" className="primary" disabled={busy || cardioDone}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
