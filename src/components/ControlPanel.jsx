import { useState } from 'react';
import { MAX_PEOPLE } from '../lib/constants.js';
import { dayLabel } from '../lib/metrics.js';

const NEW_PERSON = 'new';

// [value, short label, full description for the hover title]
const MODE_OPTIONS = [
  ['total', 'Total', 'Total weight: last 3 sets, weight × reps'],
  ['pct', '% change', '% change since first log'],
  ['best', 'Best set', 'Best set of the day'],
  ['bw', '× BW', 'Best set as a multiple of body weight'],
];

// Log today's body weight for the selected person. Shown under the chart options; it is
// only used by the "× BW" mode, so there is no tile for it.
function BodyWeightField({ me, latest, onSave }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    const kg = Number(value);
    if (value === '' || !(kg >= 20 && kg <= 400)) {
      setError('Enter 20 to 400 kg.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(kg);
      setValue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  let note;
  if (!me) note = 'Choose who you are to log your body weight.';
  else if (latest) note = `Last: ${latest.weight_kg} kg on ${dayLabel(latest.date)}. Saving logs it for today.`;
  else note = 'Saving logs it for today. Used by the × BW chart mode.';

  return (
    <form className="bw-field" onSubmit={save}>
      <label htmlFor="bw-input">Body weight</label>
      <input
        id="bw-input"
        className="dark-input"
        type="number"
        inputMode="decimal"
        min="20"
        max="400"
        step="0.1"
        placeholder={latest ? String(latest.weight_kg) : 'kg'}
        value={value}
        disabled={!me || busy}
        onChange={(e) => setValue(e.target.value)}
        title={note}
        aria-describedby="bw-note"
      />
      <button type="submit" className="ghost-dark small" disabled={!me || busy}>
        Save
      </button>
      {/* Only errors take up a line, so the tile keeps its fixed height. */}
      <p id="bw-note" className={error ? 'bw-note dark-error' : 'sr-only'} role={error ? 'alert' : undefined}>
        {error || note}
      </p>
    </form>
  );
}

// The full-width top tile. Its first section is identity and chart mode; the other
// sections (activity grid, activity log, Google Sheets) are passed in as children.
// The activity grid's name column doubles as the key for line colours.
export default function ControlPanel({
  people,
  me,
  onSelect,
  onAddPerson,
  mode,
  onModeChange,
  equalise,
  onEqualiseChange,
  latestBodyWeight,
  onLogBodyWeight,
  children,
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleSelect(event) {
    const value = event.target.value;
    setError('');
    if (value === NEW_PERSON) {
      setAdding(true);
      return;
    }
    setAdding(false);
    onSelect(value ? Number(value) : null);
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onAddPerson(name);
      setName('');
      setAdding(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel control" aria-label="Who you are, how charts are shown, and recent activity">
      <div className="control-main">
        <h1 className="wordmark">
          <em>FRIFT</em>
        </h1>

        <div className="control-group">
          <label className="dark-field" htmlFor="who">
            Who are you?
          </label>
          <select id="who" className="dark-select" value={adding ? NEW_PERSON : me?.id ?? ''} onChange={handleSelect}>
            <option value="">Choose your name</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {people.length < MAX_PEOPLE && <option value={NEW_PERSON}>Add a new person…</option>}
          </select>

          {adding && (
            <form className="add-person" onSubmit={handleAdd}>
              <input
                className="dark-input"
                type="text"
                maxLength={24}
                placeholder="Your name"
                aria-label="New person's name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="primary small" disabled={busy}>
                Add
              </button>
              <button
                type="button"
                className="ghost-dark small"
                onClick={() => {
                  setAdding(false);
                  setError('');
                }}
              >
                Cancel
              </button>
            </form>
          )}
          {error && (
            <p className="dark-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <fieldset className="mode">
          <legend>Charts show</legend>
          {MODE_OPTIONS.map(([value, label, title]) => (
            <label key={value} title={title}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => onModeChange(value)} />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="equalise">
          <label>
            <input type="checkbox" checked={equalise} onChange={(e) => onEqualiseChange(e.target.checked)} />
            Equalise
          </label>
          <span className="info">
            <button type="button" className="info-btn" aria-describedby="equalise-info">
              What is this?
            </button>
            <span id="equalise-info" role="tooltip" className="info-tip">
              Doubles dumbbell weights, so they compare fairly with barbell lifts.
            </span>
          </span>
        </div>

        <BodyWeightField key={me?.id ?? 'none'} me={me} latest={latestBodyWeight} onSave={onLogBodyWeight} />
      </div>

      {children}
    </section>
  );
}
