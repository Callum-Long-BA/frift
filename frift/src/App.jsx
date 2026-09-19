import { useCallback, useEffect, useState } from 'react';
import { api, AuthError, clearPasscode, getPasscode } from './api.js';
import { EXERCISES } from './lib/constants.js';
import { readStored, writeStored } from './lib/storage.js';
import ControlPanel from './components/ControlPanel.jsx';
import ExerciseChart from './components/ExerciseChart.jsx';
import AddEntryDialog from './components/AddEntryDialog.jsx';
import PasscodeGate from './components/PasscodeGate.jsx';

const ME_KEY = 'frift.me';
const MODE_KEY = 'frift.mode';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getPasscode()));
  const [people, setPeople] = useState([]);
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [meId, setMeId] = useState(() => Number(readStored(ME_KEY)) || null);
  const [mode, setMode] = useState(() => (readStored(MODE_KEY) === 'pct' ? 'pct' : 'total'));
  const [dialogExerciseId, setDialogExerciseId] = useState(null);

  const me = people.find((p) => p.id === meId) ?? null;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading');
    try {
      const [nextPeople, nextEntries] = await Promise.all([api.people(), api.entries()]);
      setPeople(nextPeople);
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

  // Pick up friends' new entries when you come back to the tab.
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

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const dialogExercise = EXERCISES.find((e) => e.id === dialogExerciseId);

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
      />

      {EXERCISES.map((exercise) => (
        <ExerciseChart
          key={exercise.id}
          exercise={exercise}
          people={people}
          entries={entries}
          me={me}
          mode={mode}
          loading={status === 'loading'}
          onAdd={() => setDialogExerciseId(exercise.id)}
        />
      ))}

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
    </main>
  );
}
