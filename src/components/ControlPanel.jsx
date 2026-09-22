import { useState } from 'react';
import { MAX_PEOPLE } from '../lib/constants.js';

const NEW_PERSON = 'new';

const MODE_OPTIONS = [
  ['total', 'Total weight'],
  ['pct', '% change'],
  ['best', 'Best set'],
];

// The big top-left tile: identity and chart mode on the left, and (as children) the
// last-3-weeks activity grid beside them. The grid's name column doubles as the key for
// line colours, so the tile stays a fixed height however many people there are.
export default function ControlPanel({
  people,
  me,
  onSelect,
  onAddPerson,
  mode,
  onModeChange,
  equalise,
  onEqualiseChange,
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
          {MODE_OPTIONS.map(([value, label]) => (
            <label key={value}>
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
      </div>

      {children}
    </section>
  );
}
