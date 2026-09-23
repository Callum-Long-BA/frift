import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AuthError, clearPasscode, getPasscode } from './api.js';
import { MAX_EXERCISES, MODES } from './lib/constants.js';
import { readStored, writeStored } from './lib/storage.js';
import { colourFor } from './lib/theme.js';
import { todayString } from './lib/metrics.js';
import ControlPanel from './components/ControlPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ExerciseChart from './components/ExerciseChart.jsx';
import RunningChart from './components/RunningChart.jsx';
import AddEntryDialog from './components/AddEntryDialog.jsx';
import AddExerciseDialog from './components/AddExerciseDialog.jsx';
import ActivityStrip from './components/ActivityStrip.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import SheetsInfo from './components/SheetsInfo.jsx';
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
  const [bodyWeights, setBodyWeights] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [meId, setMeId] = useState(() => Number(readStored(ME_KEY)) || null);
  const [mode, setMode] = useState(() => {
    const stored = readStored(MODE_KEY);
    return MODES.includes(stored) ? stored : 'total';
  });
  const [equalise, setEqualise] = useState(() => readStored(EQUALISE_KEY) === '1');
  const [dialogExerciseId, setDialogExerciseId] = useState(null);
  const [dialogRunType, setDialogRunType] = useState('easy');
  const [addingExercise, setAddingExercise] = useState(false);

  // People are stored with their original colour; show the lighter twin that suits the dark page.
  const themedPeople = useMemo(() => people.map((p) => ({ ...p, colour: colourFor(p.colour) })), [people]);
  const me = themedPeople.find((p) => p.id === meId) ?? null;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading');
    try {
      const [nextPeople, nextExercises, nextEntries, nextBodyWeights] = await Promise.all([
        api.people(),
        api.exercises(),
        api.entries(),
        // Body weight only feeds the "× BW" mode, so a failure here should not stop the page.
        api.bodyWeights().catch((err) => {
          if (err instanceof AuthError) throw err;
          return [];
        }),
      ]);
      setPeople(nextPeople);
      setExercises(nextExercises);
      setEntries(nextEntries);
      setBodyWeights(nextBodyWeights);
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

  // One reading per person per day, so today's replaces any earlier one from today.
  async function logBodyWeight(weightKg) {
    const saved = await api.logBodyWeight(me.id, todayString(), weightKg);
    setBodyWeights((prev) => [
      ...prev.filter((b) => !(b.person_id === saved.person_id && b.date === saved.date)),
      saved,
    ]);
  }

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const dialogExercise = exercises.find((e) => e.id === dialogExerciseId);
  const latestBodyWeight = me
    ? bodyWeights.filter((b) => b.person_id === me.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null
    : null;

  // Weighted exercises fill the left three columns; cardio and reps-only exercises
  // stack in the far right column. Each keeps its own sort order.
  const weightExercises = exercises.filter((e) => e.kind === 'strength');
  const ccExercises = exercises.filter((e) => e.kind !== 'strength');

  const renderChart = (exercise) => (
    <ErrorBoundary
      key={exercise.id}
      resetKey={`${mode}-${equalise}-${entries.length}-${bodyWeights.length}`}
      fallback={(error) => (
        <section className="panel">
          <p className="chart-empty">
            {exercise.name} could not be drawn: {String(error?.message ?? error)}
          </p>
        </section>
      )}
    >
      {exercise.kind === 'running' ? (
        <RunningChart
          exercise={exercise}
          people={themedPeople}
          entries={entries}
          me={me}
          loading={status === 'loading'}
          onAdd={(runType) => {
            setDialogRunType(runType);
            setDialogExerciseId(exercise.id);
          }}
        />
      ) : (
        <ExerciseChart
          exercise={exercise}
          people={themedPeople}
          entries={entries}
          bodyWeights={bodyWeights}
          me={me}
          mode={mode}
          equalise={equalise}
          loading={status === 'loading'}
          onAdd={() => setDialogExerciseId(exercise.id)}
        />
      )}
    </ErrorBoundary>
  );

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
        people={themedPeople}
        me={me}
        onSelect={selectPerson}
        onAddPerson={addPerson}
        mode={mode}
        onModeChange={changeMode}
        equalise={equalise}
        onEqualiseChange={changeEqualise}
        latestBodyWeight={latestBodyWeight}
        onLogBodyWeight={logBodyWeight}
      >
        {status === 'ready' && (
          <>
            <ActivityStrip people={themedPeople} entries={entries} exercises={exercises} me={me} />
            <ActivityLog people={themedPeople} entries={entries} exercises={exercises} />
          </>
        )}
        <SheetsInfo />
      </ControlPanel>

      <div className="zone zone-weights" role="region" aria-labelledby="zone-weights-title">
        <h2 id="zone-weights-title" className="zone-title">
          Weight training
        </h2>

        {status === 'loading' && exercises.length === 0 && (
          <section className="panel">
            <p className="chart-empty">Loading…</p>
          </section>
        )}

        {weightExercises.map(renderChart)}

        {status === 'ready' && (
          <AddExerciseTile
            canAdd={Boolean(me)}
            count={exercises.length}
            atLimit={exercises.length >= MAX_EXERCISES}
            onAdd={() => setAddingExercise(true)}
          />
        )}
      </div>

      <div className="zone zone-cc" role="region" aria-labelledby="zone-cc-title">
        <h2 id="zone-cc-title" className="zone-title">
          Cardio &amp; calisthenics
        </h2>
        {ccExercises.map(renderChart)}
      </div>

      {dialogExercise && me && (
        <AddEntryDialog
          key={`${dialogExercise.id}-${me.id}`}
          exercise={dialogExercise}
          runType={dialogRunType}
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
