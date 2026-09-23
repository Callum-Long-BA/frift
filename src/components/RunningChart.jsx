import { useMemo, useState } from 'react';
import { RUN_TYPES, RUN_TYPE_LABELS, TEMPO_DISTANCES } from '../lib/constants.js';
import { formatDayLong, formatDuration, formatPace, runPace, runningChartData } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

const RUN_TYPE_KEY = 'frift.runType';
const TEMPO_KEY = 'frift.tempoDistance';

const km = (n) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })} km`;

// One run as text: "5 km in 24:10 (4:50 /km)".
export const runText = (r) => `${km(r.distanceKm)} in ${formatDuration(r.seconds)} (${formatPace(runPace(r.seconds, r.distanceKm))})`;

// Hover card: each person's value for that day, and every run (or interval) behind it.
function RunTooltip({ active, payload, label, runType }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (items.length === 0) return null;
  // Best first: furthest for easy, fastest pace for tempo and intervals.
  items.sort((a, b) => (runType === 'easy' ? b.value - a.value : a.value - b.value));

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
                <span className="tip-value">{runType === 'easy' ? km(item.value) : formatPace(item.value)}</span>
              </div>
              <p className="tip-sets">
                {runs.map((r, i) => (
                  <span key={r.setNumber} className="tip-set is-counted">
                    {i > 0 && <br />}
                    {runType === 'intervals' && `${i + 1}. `}
                    {runText(r)}
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

function subtitleFor(runType, tempoDistance) {
  if (runType === 'easy') return 'Easy runs, distance per day, km';
  if (runType === 'intervals') return 'Intervals, average pace per session. Higher is faster';
  const label = TEMPO_DISTANCES.find((d) => d.key === tempoDistance)?.label;
  return `Tempo ${tempoDistance === 'all' ? 'runs' : label}, best pace. Higher is faster`;
}

// The Running tile. A dropdown picks which run type is charted (easy, tempo or intervals),
// and for tempo a switch picks 5K, 10K or all distances. Both choices are remembered in
// this browser. The + button logs a run of the type currently shown.
export default function RunningChart({ exercise, people, entries, me, loading, onAdd }) {
  const [runType, setRunType] = useState(() => {
    const stored = readStored(RUN_TYPE_KEY);
    return RUN_TYPES.includes(stored) ? stored : 'easy';
  });
  const [tempoDistance, setTempoDistance] = useState(() => {
    const stored = readStored(TEMPO_KEY);
    return TEMPO_DISTANCES.some((d) => d.key === stored) ? stored : '5k';
  });

  const { rows, personIds } = useMemo(
    () => runningChartData(entries, runType, { tempoDistance }),
    [entries, runType, tempoDistance],
  );

  function changeRunType(next) {
    setRunType(next);
    writeStored(RUN_TYPE_KEY, next);
  }

  function changeTempoDistance(next) {
    setTempoDistance(next);
    writeStored(TEMPO_KEY, next);
  }

  const label = RUN_TYPE_LABELS[runType].toLowerCase();
  let emptyText;
  if (loading) emptyText = 'Loading…';
  else if (me) emptyText = `No ${runType === 'tempo' && tempoDistance !== 'all' ? `${TEMPO_DISTANCES.find((d) => d.key === tempoDistance).label} ` : ''}${label} runs yet. Tap + to log one.`;
  else emptyText = `No ${label} runs yet. Choose who you are to log one.`;

  const controls = (
    <>
      <select
        className="run-select"
        value={runType}
        onChange={(e) => changeRunType(e.target.value)}
        aria-label="Run type to chart"
      >
        {RUN_TYPES.map((t) => (
          <option key={t} value={t}>
            {RUN_TYPE_LABELS[t]}
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
      subtitle={subtitleFor(runType, tempoDistance)}
      controls={controls}
      addLabel={`Log a ${label} run`}
      canAdd={Boolean(me)}
      onAdd={() => onAdd(runType)}
    >
      {(full) => (
        <LinesChart
          rows={rows}
          personIds={personIds}
          people={people}
          me={me}
          full={full}
          emptyText={emptyText}
          reversed={runType !== 'easy'}
          yDomain={runType === 'easy' ? undefined : ['auto', 'auto']}
          yTickFormatter={runType === 'easy' ? (v) => `${v}` : (v) => formatDuration(v)}
          tooltip={<RunTooltip runType={runType} />}
        />
      )}
    </ChartFrame>
  );
}
