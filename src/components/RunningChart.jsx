import { useMemo, useState } from 'react';
import { RUN_TYPE_LABELS, TEMPO_DISTANCES, paceUnitFor, runTypesFor } from '../lib/constants.js';
import { formatDayLong, formatDuration, formatPace, runPace, runningChartData, vo2maxChartData } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

const RUN_TYPE_KEY = 'frift.runType';
// The Running tile's extra view: VO2 max scores rather than runs.
const SCORE = 'score';
const TEMPO_KEY = 'frift.tempoDistance';

const km = (n) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })} km`;

// One run as text: "5 km in 24:10 (4:50 /km)". Swims give their pace per 100 m.
export function runText(r, exerciseId = 'running') {
  const pace = paceUnitFor(exerciseId);
  return `${km(r.distanceKm)} in ${formatDuration(r.seconds)} (${formatPace(runPace(r.seconds, r.distanceKm) * pace.km, pace.label)})`;
}

// Hover card: each person's value for that day, and every run (or interval) behind it.
function RunTooltip({ active, payload, label, runType, exerciseId }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (items.length === 0) return null;
  // Best first: furthest for easy, fastest pace for tempo and intervals.
  items.sort((a, b) => (runType === 'easy' || runType === SCORE ? b.value - a.value : a.value - b.value));
  const paceLabel = paceUnitFor(exerciseId).label;

  return (
    <div className="tip">
      <p className="tip-date">{formatDayLong(label)}</p>
      <ul>
        {items.map((item) => {
          const runs = item.payload?.detail?.[item.dataKey] ?? [];
          return (
            <li key={item.dataKey}>
              <div className="tip-line">
                <span className="swatch" style={{ background: item.color ?? item.stroke }} aria-hidden="true" />
                <span className="tip-name">{item.name}</span>
                <span className="tip-value">
                  {runType === 'easy' ? km(item.value) : runType === SCORE ? `VO2 max ${item.value}` : formatPace(item.value, paceLabel)}
                </span>
              </div>
              <p className="tip-sets">
                {runs.map((r, i) => (
                  <span key={r.setNumber} className="tip-set is-counted">
                    {i > 0 && <br />}
                    {runs.length > 1 && `${i + 1}. `}
                    {runText(r, exerciseId)}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function subtitleFor(runType, tempoDistance, noun) {
  if (runType === SCORE) return 'VO2 max score, ml/kg/min';
  if (runType === 'easy') return `Easy ${noun}s, distance per day, km`;
  if (runType !== 'tempo') return `${RUN_TYPE_LABELS[runType]}, average pace per session. Higher is faster`;
  const label = TEMPO_DISTANCES.find((d) => d.key === tempoDistance)?.label;
  return `Tempo ${tempoDistance === 'all' ? `${noun}s` : label}, best pace. Higher is faster`;
}

// The Running tile (and the Swimming tile, which works the same way). A dropdown picks which
// run type is charted (easy, tempo, intervals, and for running VO2 max sessions, hills and
// VO2 max scores), and for tempo a switch picks 5K, 10K or all distances. Both choices are
// remembered in this browser, per tile. The + button logs whatever is shown.
export default function RunningChart({ exercise, people, entries, vo2max = [], me, loading, onAdd, axisStart }) {
  const views = [...runTypesFor(exercise.id), ...(exercise.id === 'running' ? [SCORE] : [])];
  const typeKey = `${RUN_TYPE_KEY}.${exercise.id}`;
  const [runType, setRunType] = useState(() => {
    const stored = readStored(typeKey) ?? (exercise.id === 'running' ? readStored(RUN_TYPE_KEY) : null);
    return views.includes(stored) ? stored : 'easy';
  });
  const pace = paceUnitFor(exercise.id);
  const [tempoDistance, setTempoDistance] = useState(() => {
    const stored = readStored(TEMPO_KEY);
    return TEMPO_DISTANCES.some((d) => d.key === stored) ? stored : '5k';
  });

  const { rows, personIds } = useMemo(
    () =>
      runType === SCORE
        ? vo2maxChartData(vo2max)
        : runningChartData(entries, runType, { tempoDistance, exerciseId: exercise.id, paceKm: pace.km }),
    [entries, vo2max, runType, tempoDistance, exercise.id, pace.km],
  );

  function changeRunType(next) {
    setRunType(next);
    writeStored(typeKey, next);
  }

  function changeTempoDistance(next) {
    setTempoDistance(next);
    writeStored(TEMPO_KEY, next);
  }

  const noun = exercise.id === 'swimming' ? 'swim' : 'run';
  const label = runType === SCORE ? 'VO2 max score' : RUN_TYPE_LABELS[runType].toLowerCase();
  let emptyText;
  if (loading) emptyText = 'Loading…';
  else if (runType === SCORE) emptyText = me ? 'No VO2 max scores yet. Tap + to log one.' : 'No VO2 max scores yet. Choose who you are to log one.';
  else if (me) emptyText = `No ${runType === 'tempo' && tempoDistance !== 'all' ? `${TEMPO_DISTANCES.find((d) => d.key === tempoDistance).label} ` : ''}${label} ${noun}s yet. Tap + to log one.`;
  else emptyText = `No ${label} ${noun}s yet. Choose who you are to log one.`;

  const controls = (
    <>
      <select
        className="run-select"
        value={runType}
        onChange={(e) => changeRunType(e.target.value)}
        aria-label="Run type to chart"
      >
        {views.map((t) => (
          <option key={t} value={t}>
            {t === SCORE ? 'VO2 max score' : RUN_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {runType === 'tempo' && (
        <div className="segmented" role="group" aria-label="Tempo distance">
          {TEMPO_DISTANCES.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={tempoDistance === d.key}
              onClick={() => changeTempoDistance(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <ChartFrame
      headingId={`chart-${exercise.id}`}
      title={exercise.name}
      subtitle={subtitleFor(runType, tempoDistance, noun)}
      controls={controls}
      addLabel={runType === SCORE ? 'Log a VO2 max score' : `Log a ${label} ${noun}`}
      canAdd={Boolean(me)}
      onAdd={() => onAdd(runType)}
    >
      {(full) => (
        <LinesChart
          axisStart={axisStart}
          rows={rows}
          personIds={personIds}
          people={people}
          me={me}
          full={full}
          emptyText={emptyText}
          reversed={runType !== 'easy' && runType !== SCORE}
          yDomain={runType === 'easy' ? undefined : ['auto', 'auto']}
          yTickFormatter={runType === 'easy' || runType === SCORE ? (v) => `${v}` : (v) => formatDuration(v)}
          tooltip={<RunTooltip runType={runType} exerciseId={exercise.id} />}
        />
      )}
    </ChartFrame>
  );
}
