import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { COUNTED_SETS, MAX_SETS_PER_ENTRY, MAX_WEIGHT, MIN_WEIGHT, RUN_TYPES, RUN_TYPE_LABELS } from '../lib/constants.js';
import { nextSetNumber, todayString } from '../lib/metrics.js';
import { runText } from './RunningChart.jsx';

const EMPTY_RUN = { km: '', min: '', sec: '' };

// `runType` is the run type the Running tile was showing, used as the starting choice.
export default function AddEntryDialog({ exercise, person, entries, runType: initialRunType = 'easy', onClose, onSaved, onDeleted }) {
  const dialogRef = useRef(null);
  const [date, setDate] = useState(() => todayString());
  const [sets, setSets] = useState([{ weight: '', reps: '' }]);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCardio = exercise.kind === 'cardio';
  const isRunning = exercise.kind === 'running';
  const repsOnly = exercise.kind === 'reps';
  const hasEquipment = exercise.kind === 'strength' && exercise.equipment_choice === true;
  const [runType, setRunType] = useState(initialRunType);
  const [runs, setRuns] = useState([EMPTY_RUN]);
  const isIntervals = runType === 'intervals';

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

  function updateRun(index, patch) {
    setRuns((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function changeRunType(next) {
    setRunType(next);
    // Easy and tempo are one run; keep only the first row when leaving intervals.
    if (next !== 'intervals') setRuns((prev) => prev.slice(0, 1));
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
    } else if (isRunning) {
      const parsed = [];
      for (let i = 0; i < runs.length; i++) {
        const { km, min, sec } = runs[i];
        const fail = (text) => setError(isIntervals ? `Interval ${i + 1}: ${text}` : text[0].toUpperCase() + text.slice(1));
        const distanceKm = Number(km);
        if (km === '' || !(distanceKm > 0)) {
          fail('enter the distance in km.');
          return;
        }
        const minutesPart = min === '' ? 0 : Number(min);
        const secondsPart = sec === '' ? 0 : Number(sec);
        if (!Number.isInteger(minutesPart) || minutesPart < 0 || !Number.isInteger(secondsPart) || secondsPart < 0 || secondsPart > 59) {
          fail('enter the time as whole minutes and 0 to 59 seconds.');
          return;
        }
        const seconds = minutesPart * 60 + secondsPart;
        if (seconds < 1) {
          fail('enter the time it took.');
          return;
        }
        parsed.push({ distanceKm, seconds });
      }
      payload = { personId: person.id, exercise: exercise.id, date, runType, runs: parsed };
    } else {
      const parsed = [];
      for (let i = 0; i < sets.length; i++) {
        const { weight, reps } = sets[i];
        const label = `Set ${firstNewSet + i}`;
        if (!repsOnly && (weight === '' || Number.isNaN(Number(weight)))) {
          setError(`${label}: enter a weight in kg (minus for assisted).`);
          return;
        }
        if (!repsOnly && (Number(weight) < MIN_WEIGHT || Number(weight) > MAX_WEIGHT)) {
          setError(`${label}: weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT} kg.`);
          return;
        }
        if (reps === '' || !Number.isInteger(Number(reps)) || Number(reps) < 1) {
          setError(`${label}: enter reps as a whole number, 1 or more.`);
          return;
        }
        parsed.push(repsOnly ? { reps: Number(reps) } : { weight: Number(weight), reps: Number(reps) });
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

  let submitLabel;
  if (isCardio) submitLabel = 'Save cardio';
  else if (isRunning) submitLabel = isIntervals ? `Save ${runs.length} ${runs.length === 1 ? 'interval' : 'intervals'}` : 'Save run';
  else submitLabel = `Save ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`;

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

        {isRunning && (
          <fieldset className="runs" disabled={busy}>
            <legend>Run type</legend>
            <div className="equipment run-types">
              {RUN_TYPES.map((t) => (
                <label key={t}>
                  <input type="radio" name="runType" value={t} checked={runType === t} onChange={() => changeRunType(t)} />
                  {RUN_TYPE_LABELS[t]}
                </label>
              ))}
            </div>

            {runType === 'tempo' && (
              <div className="quick-distances">
                <span className="hint">Distance:</span>
                {[5, 10].map((d) => (
                  <button key={d} type="button" className="chip" aria-pressed={runs[0].km === String(d)} onClick={() => updateRun(0, { km: String(d) })}>
                    {d} km
                  </button>
                ))}
              </div>
            )}

            {runs.map((r, i) => (
              <div className="run-row" key={i}>
                <span className="set-label">{isIntervals ? `Interval ${i + 1}` : 'Run'}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="200"
                  step="0.01"
                  placeholder="km"
                  aria-label={`${isIntervals ? `Interval ${i + 1}` : 'Run'} distance in km`}
                  value={r.km}
                  onChange={(e) => updateRun(i, { km: e.target.value })}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="min"
                  aria-label={`${isIntervals ? `Interval ${i + 1}` : 'Run'} time, minutes`}
                  value={r.min}
                  onChange={(e) => updateRun(i, { min: e.target.value })}
                />
                <span className="times" aria-hidden="true">
                  :
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="59"
                  step="1"
                  placeholder="sec"
                  aria-label={`${isIntervals ? `Interval ${i + 1}` : 'Run'} time, seconds`}
                  value={r.sec}
                  onChange={(e) => updateRun(i, { sec: e.target.value })}
                />
                {isIntervals && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove interval ${i + 1}`}
                    disabled={runs.length === 1}
                    onClick={() => setRuns((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {isIntervals && (
              <button
                type="button"
                className="text-btn"
                disabled={runs.length >= MAX_SETS_PER_ENTRY}
                onClick={() => setRuns((prev) => [...prev, { ...prev[prev.length - 1] }])}
              >
                Add another interval
              </button>
            )}
            <p className="hint">
              {runType === 'easy' && 'Easy runs are charted by distance.'}
              {runType === 'tempo' && 'Tempo runs are charted by pace, at 5K, 10K or all distances.'}
              {isIntervals && 'Enter each interval’s distance and time. Charted by average pace.'}
            </p>
          </fieldset>
        )}

        {isRunning ? null : isCardio ? (
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
                <div className={repsOnly ? 'set-row reps-only' : 'set-row'} key={i}>
                  <span className="set-label">Set {n}</span>
                  {!repsOnly && (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={MIN_WEIGHT}
                        max={MAX_WEIGHT}
                        step="0.5"
                        placeholder={isDumbbell ? 'kg each' : 'kg'}
                        aria-label={`Set ${n} weight in kilograms${isDumbbell ? ', per dumbbell' : ''}`}
                        value={s.weight}
                        onChange={(e) => updateSet(i, { weight: e.target.value })}
                      />
                      <span className="times" aria-hidden="true">
                        ×
                      </span>
                    </>
                  )}
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
            <p className="hint">
              Only the last {COUNTED_SETS} sets of the day count toward the chart.
              {!repsOnly && ' Assisted? Enter the assistance as a minus weight, e.g. -20.'}
            </p>
          </fieldset>
        )}

        {logged.length > 0 && (
          <section aria-label="Already logged on this date">
            <h3>Already logged on this date</h3>
            <ul className="logged">
              {logged.map((row) => (
                <li key={row.id}>
                  <span>
                    {isCardio
                      ? `${row.duration_min} min`
                      : isRunning
                        ? `${RUN_TYPE_LABELS[row.run_type]}: ${runText({ distanceKm: row.distance_km, seconds: row.duration_sec })}`
                        : row.weight === null
                        ? `Set ${row.set_number}: ${row.reps} reps`
                        : `Set ${row.set_number}: ${row.weight} kg × ${row.reps}${row.equipment ? `, ${row.equipment}` : ''}`}
                  </span>
                  {!isCardio && !isRunning && countedIds.has(row.id) && <span className="tag">counts</span>}
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
