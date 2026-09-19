import { useState } from 'react';
import { MAX_PEOPLE } from '../lib/constants.js';

const NEW_PERSON = 'new';

const MODE_OPTIONS = [
  ['total', 'Total weight'],
  ['pct', '% change'],
  ['best', 'Best set'],
];

// Grid cell A1: identity, chart mode, and the key for line colours.
export default function ControlPanel({ people, me, onSelect, onAddPerson, mode, onModeChange }) {
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
    <section className="panel control" aria-label="Who you are and how charts are shown">
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

      <ul className="legend" aria-label="Line colours">
        {people.length === 0 && <li className="legend-empty">No one yet. Add yourself with the menu above.</li>}
        {people.map((p) => (
          <li key={p.id} className={me?.id === p.id ? 'is-me' : undefined}>
            <span className="swatch" style={{ background: p.colour }} aria-hidden="true" />
            {p.name}
            {me?.id === p.id && <span className="you"> (you)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
