import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import {
  EQUIPMENT_LABELS,
  MAX_SETS_PER_ENTRY,
  MAX_VO2MAX,
  MAX_WEIGHT,
  MIN_VO2MAX,
  MIN_WEIGHT,
  MULTI_RUN_TYPES,
  RUN_ROW_LABELS,
  RUN_TYPE_LABELS,
  WEIGHT_STEP,
  equipmentOptions,
  equipmentTag,
  paceUnitFor,
  runTypesFor,
} from '../lib/constants.js';
import { dayLabel, exerciseHistory, formatDuration, formatPace, lastSession, nextSetNumber, runPace, todayString } from '../lib/metrics.js';
import { runText } from './RunningChart.jsx';
import { cardioText } from './CardioChart.jsx';

const EMPTY_RUN = { km: '', min: '', sec: '' };

// The Running tile's extra choice in the dialog: a VO2 max score rather than a run.
const SCORE = 'score';

// The time (or pace) boxes as seconds, or null if they are not whole minutes and 0-59 seconds.
function boxSeconds(min, sec) {
  const m = min === '' ? 0 : Number(min);
  const s = sec === '' ? 0 : Number(sec);
  if (!Number.isInteger(m) || m < 0 || !Number.isInteger(s) || s < 0 || s > 59) return null;
  return m * 60 + s;
}

// `runType` is the run type the Running tile was showing, used as the starting choice.
// `note` is this person's note for next time on this exercise (or null); `onSaveNote(text)`
// saves it (empty removes it). `vo2max` is everyone's VO2 max scores; `onLogVo2max(date, value)`
// and `onDeleteVo2max(date)` save and remove this person's.
export default function AddEntryDialog({
  exercise,
  person,
  entries,
  vo2max = [],
  onLogVo2max,
  onDeleteVo2max,
  note = null,
  onSaveNote,
  runType: initialRunType = 'easy',
  onClose,
  onSaved,
  onDeleted,
}) {
  const dialogRef = useRef(null);
  const [date, setDate] = useState(() => todayString());
  const [sets, setSets] = useState([{ weight: '', reps: '' }]);
  const [minutes, setMinutes] = useState('');
  const [speed, setSpeed] = useState('');
  const [incline, setIncline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [noteText, setNoteText] = useState(note?.note ?? '');
  const [noteState, setNoteState] = useState(''); // '', 'saving', 'saved'
  const isCardio = exercise.kind === 'cardio';
  const isRunning = exercise.kind === 'running';
  const repsOnly = exercise.kind === 'reps';
  const options = equipmentOptions(exercise);
  const hasEquipment = options.length > 0;
  // Running also offers a VO2 max score; swimming has fewer run types (see runTypesFor).
  const runChoices = [...runTypesFor(exercise.id), ...(exercise.id === 'running' ? [SCORE] : [])];
  const [runType, setRunType] = useState(runChoices.includes(initialRunType) ? initialRunType : 'easy');
  const [runs, setRuns] = useState([EMPTY_RUN]);
  const isScore = isRunning && runType === SCORE;
  const isMulti = MULTI_RUN_TYPES.includes(runType);
  const rowLabel = RUN_ROW_LABELS[runType] ?? 'Run';
  const rowName = (i) => (isMulti ? `${rowLabel} ${i + 1}` : 'Run');
  // Each run is entered as distance and time, or distance and pace (per km, or per 100 m
  // for swimming), and the other is worked out.
  const [byPace, setByPace] = useState(false);
  const pace = paceUnitFor(exercise.id);
  const [score, setScore] = useState('');

  // Start on whatever this person used last time for this exercise, else its first option.
  const [equipment, setEquipment] = useState(() => {
    const previous = entries
      .filter((e) => e.person_id === person.id && e.exercise === exercise.id && options.includes(e.equipment))
      .sort((a, b) => b.id - a.id)[0];
    return previous?.equipment ?? options[0] ?? null;
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

  // What this person did last time (before the chosen date), so they know what to beat. Each
  // set row shows the same-numbered set from then, and its boxes use those numbers as hints.
  const last = useMemo(
    () => (isScore ? null : lastSession(entries, person.id, exercise.id, date, isRunning ? runType : null)),
    [entries, person.id, exercise.id, date, isRunning, runType, isScore],
  );
  const lastSet = (n) => last?.rows.find((r) => r.set_number === n) ?? null;
  const setText = (r) => (r.weight === null ? `${r.reps} reps` : `${r.weight} kg × ${r.reps}${equipmentTag(r.equipment)}`);
  const myScores = vo2max.filter((v) => v.person_id === person.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const scoreOnDate = myScores.find((v) => v.date === date) ?? null;
  const lastScore = myScores.find((v) => v.date < date) ?? null;
  // One day's sets as text, for "last time" and the full history.
  const dayText = (rows) => {
    if (isCardio) return rows.map((r) => cardioText(r.duration_min, r.speed_kmh, r.incline_pct)).join('; ');
    if (isRunning) return rows.map((r) => `${RUN_TYPE_LABELS[r.run_type] ?? r.run_type}: ${runText({ distanceKm: r.distance_km, seconds: r.duration_sec }, exercise.id)}`).join(', ');
    return rows.map(setText).join(', ');
  };
  const lastSummary = last ? dayText(last.rows) : null;
  const history = useMemo(() => exerciseHistory(entries, person.id, exercise.id), [entries, person.id, exercise.id]);
  const noteChanged = noteText.trim() !== (note?.note ?? '');

  async function saveNote() {
    setNoteState('saving');
    try {
      await onSaveNote(noteText.trim());
      setNoteState('saved');
    } catch (err) {
      setError(err.message);
      setNoteState('');
    }
  }
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
    // Easy and tempo are one run; keep only the first row when leaving a multi-rep type.
    if (!MULTI_RUN_TYPES.includes(next)) setRuns((prev) => prev.slice(0, 1));
  }

  // A run row's distance and time in seconds, worked out from the pace if entered that way,
  // or null if either is missing or not valid.
  function runValues(r) {
    const distanceKm = Number(r.km);
    const boxes = boxSeconds(r.min, r.sec);
    if (r.km === '' || !(distanceKm > 0) || !boxes) return null;
    const seconds = byPace ? Math.round((boxes * distanceKm) / pace.km) : boxes;
    return seconds >= 1 ? { distanceKm, seconds } : null;
  }

  async function removeScore() {
    setError('');
    try {
      await onDeleteVo2max(date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (isScore) {
      const value = Number(score);
      if (score === '' || !(value >= MIN_VO2MAX && value <= MAX_VO2MAX)) {
        setError(`Enter a VO2 max between ${MIN_VO2MAX} and ${MAX_VO2MAX}.`);
        return;
      }
      setBusy(true);
      try {
        await onLogVo2max(date, value);
        if (noteChanged && onSaveNote) await onSaveNote(noteText.trim());
        closeDialog();
      } catch (err) {
        setError(err.message);
        setBusy(false);
      }
      return;
    }

    let payload;
    if (isCardio) {
      const speedKmh = Number(speed);
      const inclinePct = Number(incline);
      const durationMin = Number(minutes);
      if (speed === '' || !(speedKmh > 0 && speedKmh <= 40)) {
        setError('Enter the speed in km/h.');
        return;
      }
      if (incline === '' || !(inclinePct >= -10 && inclinePct <= 40)) {
        setError('Enter the incline in % (0 if flat).');
        return;
      }
      if (minutes === '' || !(durationMin > 0)) {
        setError('Enter the time in minutes.');
        return;
      }
      payload = { personId: person.id, exercise: exercise.id, date, durationMin, speedKmh, inclinePct };
    } else if (isRunning) {
      const parsed = [];
      const what = byPace ? 'pace' : 'time';
      for (let i = 0; i < runs.length; i++) {
        const { km, min, sec } = runs[i];
        const fail = (text) => setError(isMulti ? `${rowName(i)}: ${text}` : text[0].toUpperCase() + text.slice(1));
        if (km === '' || !(Number(km) > 0)) {
          fail('enter the distance in km.');
          return;
        }
        const boxes = boxSeconds(min, sec);
        if (boxes === null) {
          fail(`enter the ${what} as whole minutes and 0 to 59 seconds.`);
          return;
        }
        const values = runValues(runs[i]);
        if (!values) {
          fail(byPace ? 'enter the pace.' : 'enter the time it took.');
          return;
        }
        parsed.push(values);
      }
      payload = { personId: person.id, exercise: exercise.id, date, runType, runs: parsed };
    } else {
      const parsed = [];
      for (let i = 0; i < sets.length; i++) {
        const { weight, reps } = sets[i];
        const label = `Set ${firstNewSet + i}`;
        // Reps-only exercises can leave the weight empty; it is only for weighted sets.
        const noWeight = repsOnly && weight.trim() === '';
        if (!noWeight && (weight === '' || Number.isNaN(Number(weight)))) {
          setError(`${label}: enter a weight in kg (minus for assisted).`);
          return;
        }
        if (!noWeight && (Number(weight) < MIN_WEIGHT || Number(weight) > MAX_WEIGHT)) {
          setError(`${label}: weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT} kg.`);
          return;
        }
        if (!noWeight && Math.abs(Number(weight) * 100 - Math.round(Number(weight) * 100)) > 1e-6) {
          setError(`${label}: use at most 2 decimal places, e.g. 1.25 kg.`);
          return;
        }
        if (reps === '' || !Number.isInteger(Number(reps)) || Number(reps) < 1) {
          setError(`${label}: enter reps as a whole number, 1 or more.`);
          return;
        }
        parsed.push(noWeight ? { reps: Number(reps) } : { weight: Number(weight), reps: Number(reps) });
      }
      payload = { personId: person.id, exercise: exercise.id, date, sets: parsed };
      if (hasEquipment) payload.equipment = equipment;
    }

    setBusy(true);
    try {
      const rows = await api.addEntry(payload);
      onSaved(rows);
      // A note typed but not saved separately is saved with the sets.
      if (noteChanged && onSaveNote) await onSaveNote(noteText.trim());
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
  else if (isScore) submitLabel = 'Save VO2 max';
  else if (isRunning) submitLabel = isMulti ? `Save ${runs.length} ${rowLabel.toLowerCase()}${runs.length === 1 ? '' : 's'}` : 'Save run';
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

        {note && (
          <p className="note-reminder">
            <span className="last-time-label">📝 Your note · {dayLabel(note.updated_at)}</span>
            {note.note}
          </p>
        )}

        {isScore && lastScore && (
          <p className="last-time">
            <span className="last-time-label">Last time · {dayLabel(lastScore.date)}</span>
            VO2 max {lastScore.value}
          </p>
        )}

        {lastSummary && (
          <p className="last-time">
            <span className="last-time-label">Last time · {dayLabel(last.date)}</span>
            {lastSummary}
          </p>
        )}

        {!isScore && history.length > 0 && (
          <div className="history">
            <button type="button" className="text-btn" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Hide history' : `Show all history (${history.length} ${history.length === 1 ? 'day' : 'days'})`}
            </button>
            {showHistory && (
              <ol className="history-list">
                {history.map((h) => (
                  <li key={h.date}>
                    <span className="history-date">{dayLabel(h.date)}</span>
                    <span>{dayText(h.rows)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {hasEquipment && (
          <fieldset className="equipment" disabled={busy}>
            <legend>Equipment</legend>
            {options.map((o) => (
              <label key={o}>
                <input type="radio" name="equipment" value={o} checked={equipment === o} onChange={() => setEquipment(o)} />
                {EQUIPMENT_LABELS[o]}
              </label>
            ))}
            {isDumbbell && <p className="hint">Enter the weight of one dumbbell.</p>}
          </fieldset>
        )}

        {isRunning && (
          <fieldset className="runs" disabled={busy}>
            <legend>Run type</legend>
            <div className="equipment run-types">
              {runChoices.map((t) => (
                <label key={t}>
                  <input type="radio" name="runType" value={t} checked={runType === t} onChange={() => changeRunType(t)} />
                  {t === SCORE ? 'VO2 max score' : RUN_TYPE_LABELS[t]}
                </label>
              ))}
            </div>

            {isScore ? (
              <label className="field">
                VO2 max (ml/kg/min)
                <input
                  type="number"
                  inputMode="decimal"
                  min={MIN_VO2MAX}
                  max={MAX_VO2MAX}
                  step="0.1"
                  placeholder={lastScore ? String(lastScore.value) : '48'}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
                <span className="hint">The estimate from your watch. One per day: saving again replaces it.</span>
              </label>
            ) : (
              <div className="segmented run-entry" role="group" aria-label="Enter each run as">
                <button type="button" aria-pressed={!byPace} onClick={() => setByPace(false)}>
                  Time
                </button>
                <button type="button" aria-pressed={byPace} onClick={() => setByPace(true)}>
                  Pace {pace.label}
                </button>
              </div>
            )}

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

            {!isScore && runs.map((r, i) => {
              const values = runValues(r);
              let worked = null;
              if (values) {
                worked = byPace
                  ? `Time ${formatDuration(values.seconds)}`
                  : formatPace(runPace(values.seconds, values.distanceKm) * pace.km, pace.label);
              }
              return (
              <div className="run-row" key={i}>
                <span className="set-label">
                  {rowName(i)}
                  {worked && <small className="last-hint">{worked}</small>}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="200"
                  step="0.01"
                  placeholder="km"
                  aria-label={`${rowName(i)} distance in km`}
                  value={r.km}
                  onChange={(e) => updateRun(i, { km: e.target.value })}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="min"
                  aria-label={`${rowName(i)} ${byPace ? `pace ${pace.label}` : 'time'}, minutes`}
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
                  aria-label={`${rowName(i)} ${byPace ? `pace ${pace.label}` : 'time'}, seconds`}
                  value={r.sec}
                  onChange={(e) => updateRun(i, { sec: e.target.value })}
                />
                {isMulti && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${rowName(i).toLowerCase()}`}
                    disabled={runs.length === 1}
                    onClick={() => setRuns((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
              );
            })}
            {isMulti && (
              <button
                type="button"
                className="text-btn"
                disabled={runs.length >= MAX_SETS_PER_ENTRY}
                onClick={() => setRuns((prev) => [...prev, { ...prev[prev.length - 1] }])}
              >
                Add another {rowLabel.toLowerCase()}
              </button>
            )}
            <p className="hint">
              {runType === 'easy' && 'Easy runs are charted by distance.'}
              {runType === 'tempo' && 'Tempo runs are charted by pace, at 5K, 10K or all distances.'}
              {isMulti && `Enter each ${rowLabel.toLowerCase()}’s distance and ${byPace ? 'pace' : 'time'}, leaving out rests. Charted by average pace.`}
              {isScore && 'Charted on the Running tile under VO2 max score.'}
            </p>
          </fieldset>
        )}

        {isRunning ? null : isCardio ? (
          <fieldset className="cardio-fields" disabled={cardioDone || busy}>
            <legend>Session</legend>
            <label className="field">
              Speed (km/h)
              <input type="number" inputMode="decimal" min="0.1" max="40" step="0.1" placeholder="6.5" value={speed} onChange={(e) => setSpeed(e.target.value)} />
            </label>
            <label className="field">
              Incline (%)
              <input type="number" inputMode="decimal" min="-10" max="40" step="0.5" placeholder="8" value={incline} onChange={(e) => setIncline(e.target.value)} />
            </label>
            <label className="field">
              Time (minutes)
              <input type="number" inputMode="decimal" min="1" max="600" step="1" placeholder="30" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
            {cardioDone ? (
              <p className="hint">Cardio is already logged for this date. Delete it below to change it.</p>
            ) : (
              <p className="hint">Distance and height climbed are worked out from these.</p>
            )}
          </fieldset>
        ) : (
          <fieldset className="sets" disabled={busy}>
            <legend>Sets to add</legend>
            {sets.map((s, i) => {
              const n = firstNewSet + i;
              const before = lastSet(n);
              return (
                <div className="set-row" key={i}>
                  <span className="set-label">
                    Set {n}
                    {before && <small className="last-hint">last {before.weight === null ? before.reps : `${before.weight}×${before.reps}`}</small>}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={MIN_WEIGHT}
                    max={MAX_WEIGHT}
                    step={WEIGHT_STEP}
                    placeholder={before?.weight != null ? String(before.weight) : repsOnly ? '+kg' : isDumbbell ? 'kg each' : 'kg'}
                    aria-label={`Set ${n} weight in kilograms${repsOnly ? ', optional, for weighted sets' : isDumbbell ? ', per dumbbell' : ''}`}
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
                    placeholder={before ? String(before.reps) : 'reps'}
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
              {repsOnly
                ? 'Every set of the day counts toward the total. Weight is optional: fill it in for weighted sets, e.g. 10 for a 10 kg belt.'
                : 'Every set of the day counts toward the total. Weights can have 2 decimal places, e.g. 1.25.'}
              {!repsOnly && ' Assisted? Enter the assistance as a minus weight, e.g. -20.'}
            </p>
          </fieldset>
        )}

        {isScore && scoreOnDate && (
          <section aria-label="VO2 max already logged on this date">
            <h3>Already logged on this date</h3>
            <ul className="logged">
              <li>
                <span>VO2 max {scoreOnDate.value}</span>
                <button type="button" className="text-btn danger" onClick={removeScore}>
                  Delete
                </button>
              </li>
            </ul>
          </section>
        )}

        {!isScore && logged.length > 0 && (
          <section aria-label="Already logged on this date">
            <h3>Already logged on this date</h3>
            <ul className="logged">
              {logged.map((row) => (
                <li key={row.id}>
                  <span>
                    {isCardio
                      ? cardioText(row.duration_min, row.speed_kmh, row.incline_pct)
                      : isRunning
                        ? `${RUN_TYPE_LABELS[row.run_type]}: ${runText({ distanceKm: row.distance_km, seconds: row.duration_sec }, exercise.id)}`
                        : row.weight === null
                        ? `Set ${row.set_number}: ${row.reps} reps`
                        : `Set ${row.set_number}: ${row.weight} kg × ${row.reps}${row.equipment ? `, ${row.equipment}` : ''}`}
                  </span>
                  <button type="button" className="text-btn danger" onClick={() => remove(row)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {onSaveNote && (
          <div className="field note-field">
            <label htmlFor="note-next-time">Note for next time</label>
            <textarea
              id="note-next-time"
              rows={2}
              maxLength={300}
              placeholder="e.g. Try 65kg, or felt easy"
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setNoteState('');
              }}
            />
            <div className="note-actions">
              <button type="button" className="text-btn" disabled={!noteChanged || noteState === 'saving'} onClick={saveNote}>
                {noteText.trim() || !note ? 'Save note' : 'Remove note'}
              </button>
              {noteState === 'saved' && <span className="hint">Saved. You will see it next time.</span>}
              {noteChanged && noteState !== 'saved' && <span className="hint">Also saved when you save your sets.</span>}
            </div>
          </div>
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
