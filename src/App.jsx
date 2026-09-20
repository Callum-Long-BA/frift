import { useCallback, useEffect, useState } from 'react';
import { api, AuthError, clearPasscode, getPasscode } from './api.js';
import { MAX_EXERCISES, MODES } from './lib/constants.js';
import { readStored, writeStored } from './lib/storage.js';
import ControlPanel from './components/ControlPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ExerciseChart from './components/ExerciseChart.jsx';
import AddEntryDialog from './components/AddEntryDialog.jsx';
import AddExerciseDialog from './components/AddExerciseDialog.jsx';
import AddExerciseTile from './components/AddExerciseTile.jsx';
import PasscodeGate from './components/PasscodeGate.jsx';

const ME_KEY = 'frift.me';
const MODE_KEY = 'frift.mode';
const EQUALISE_KEY = 'frift.equalise';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getPasscode()));
  const [people, setPeople] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [meId, setMeId] = useState(() => Number(readStored(ME_KEY)) || null);
  const [mode, setMode] = useState(() => {
    const stored = readStored(MODE_KEY);
    return MODES.includes(stored) ? stored : 'total';
  });
  const [equalise, setEqualise] = useState(() => readStored(EQUALISE_KEY) === '1');
  const [dialogExerciseId, setDialogExerciseId] = useState(null);
  const [addingExercise, setAddingExercise] = useState(false);

  const me = people.find((p) => p.id === meId) ?? null;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading');
    try {
      const [nextPeople, nextExercises, nextEntries] = await Promise.all([
        api.people(),
        api.exercises(),
        api.entries(),
      ]);
      setPeople(nextPeople);
      setExercises(nextExercises);
      setEntries(nextEntries);
      setError('');
      setStatus('ready');
    } catch (err) {
      if (err instanceof AuthError) {
        clearPasscode();
        setUnlocked(false);
        return;
      }
      if (!quiet) {
        setError(err.message);
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  // Pick up friends' new entries and exercises when you come back to the tab.
  useEffect(() => {
    if (!unlocked) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [unlocked, load]);

  function selectPerson(id) {
    setMeId(id);
    writeStored(ME_KEY, id ? String(id) : '');
  }

  async function addPerson(name) {
    const person = await api.addPerson(name);
    setPeople((prev) => [...prev, person]);
    selectPerson(person.id);
  }

  function changeMode(next) {
    setMode(next);
    writeStored(MODE_KEY, next);
  }

  function changeEqualise(next) {
    setEqualise(next);
    writeStored(EQUALISE_KEY, next ? '1' : '0');
  }

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const dialogExercise = exercises.find((e) => e.id === dialogExerciseId);

  return (
    <main className="board" aria-busy={status === 'loading'}>
      {status === 'error' && (
        <div className="banner" role="alert">
          <span>Could not load the data: {error}</span>
          <button type="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}

      <ControlPanel
        people={people}
        me={me}
        onSelect={selectPerson}
        onAddPerson={addPerson}
        mode={mode}
        onModeChange={changeMode}
        equalise={equalise}
        onEqualiseChange={changeEqualise}
      />

      {status === 'loading' && exercises.length === 0 && (
        <section className="panel">
          <p className="chart-empty">Loading…</p>
        </section>
      )}

      {exercises.map((exercise) => (
        <ErrorBoundary
          key={exercise.id}
          resetKey={`${mode}-${equalise}-${entries.length}`}
          fallback={(error) => (
            <section className="panel">
              <p className="chart-empty">
                {exercise.name} could not be drawn: {String(error?.message ?? error)}
              </p>
            </section>
          )}
        >
          <ExerciseChart
            exercise={exercise}
            people={people}
            entries={entries}
            me={me}
            mode={mode}
            equalise={equalise}
            loading={status === 'loading'}
            onAdd={() => setDialogExerciseId(exercise.id)}
          />
        </ErrorBoundary>
      ))}

      {status === 'ready' && (
        <AddExerciseTile
          canAdd={Boolean(me)}
          count={exercises.length}
          atLimit={exercises.length >= MAX_EXERCISES}
          onAdd={() => setAddingExercise(true)}
        />
      )}

      {dialogExercise && me && (
        <AddEntryDialog
          key={`${dialogExercise.id}-${me.id}`}
          exercise={dialogExercise}
          person={me}
          entries={entries}
          onClose={() => setDialogExerciseId(null)}
          onSaved={(rows) => setEntries((prev) => [...prev, ...rows])}
          onDeleted={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
        />
      )}

      {addingExercise && me && (
        <AddExerciseDialog
          person={me}
          exercises={exercises}
          onClose={() => setAddingExercise(false)}
          onCreated={(exercise) => setExercises((prev) => [...prev, exercise])}
        />
      )}
    </main>
  );
}
