import { useMemo } from 'react';
import { COUNTED_SETS } from '../lib/constants.js';
import { buildChartData, formatAmount, formatDayLong } from '../lib/metrics.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

// Hover card: everyone's value for that day, plus every set they did.
// Sets that count toward the chart in the current mode are bold; the rest are faded.
export function ChartTooltip({ active, payload, label, mode, kind, equalise = false }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;

  const setsFor = (item) => item.payload?.detail?.[item.dataKey] ?? [];
  const anyFaded = items.some((item) => setsFor(item).some((s) => !s.counts));
  const anyDumbbell = items.some((item) => setsFor(item).some((s) => s.equipment === 'dumbbell'));

  return (
    <div className="tip">
      <p className="tip-date">{formatDayLong(label)}</p>
      <ul>
        {items.map((item) => {
          const sets = setsFor(item);
          return (
            <li key={item.dataKey}>
              <div className="tip-line">
                <span className="swatch" style={{ background: item.color ?? item.stroke }} aria-hidden="true" />
                <span className="tip-name">{item.name}</span>
                <span className="tip-value">
                  {formatAmount(item.value, mode, kind)}
                  {(mode === 'best' || mode === 'bw') && kind === 'strength' && sets.find((s) => s.counts) && ` (${sets.find((s) => s.counts).reps} reps)`}
                </span>
              </div>
              {sets.length > 0 && (
                <p className="tip-sets">
                  <span className="tip-sets-label">Sets</span>
                  {sets.map((s, i) => (
                    <span key={s.setNumber} className={s.counts ? 'tip-set is-counted' : 'tip-set'}>
                      {i > 0 && ', '}
                      {kind === 'reps' ? s.reps : `${s.weight}×${s.reps}`}
                      {s.equipment === 'dumbbell' && ' DB'}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {anyDumbbell && (
        <p className="tip-note">
          {equalise
            ? 'DB is dumbbell. Its weight is one dumbbell, counted at double here.'
            : 'DB is dumbbell. Its weight is one dumbbell.'}
        </p>
      )}
      {anyFaded && (
        <p className="tip-note">
          {mode === 'best' || mode === 'bw'
            ? 'Bold is the best set of the day. Faded sets are not counted.'
            : `Faded sets are earlier than the last ${COUNTED_SETS}, so they do not count.`}
        </p>
      )}
    </div>
  );
}

function subtitleFor(exercise, mode, equalise) {
  if (exercise.kind === 'cardio') return mode === 'pct' ? 'Minutes, change since first log' : 'Minutes per day';
  if (exercise.kind === 'reps') {
    if (mode === 'pct') return 'Total reps, change since first log';
    if (mode === 'best' || mode === 'bw') return 'Best set of the day, reps';
    return `Last ${COUNTED_SETS} sets, total reps`;
  }
  let text;
  if (mode === 'pct') text = 'Total weight, change since first log';
  else if (mode === 'best') text = 'Best set of the day, kg';
  else if (mode === 'bw') text = 'Best set ÷ body weight';
  else text = `Last ${COUNTED_SETS} sets, weight × reps, kg`;
  return equalise && exercise.equipment_choice ? `${text}. Dumbbells doubled.` : text;
}

export default function ExerciseChart({
  exercise,
  people,
  entries,
  bodyWeights = [],
  me,
  mode,
  equalise = false,
  loading,
  onAdd,
}) {
  const { rows, personIds } = useMemo(
    () => buildChartData(entries, exercise, mode, { equalise, bodyWeights }),
    [entries, exercise, mode, equalise, bodyWeights],
  );

  const perBw = mode === 'bw' && exercise.kind === 'strength';
  let emptyText;
  if (loading) emptyText = 'Loading…';
  else if (perBw && entries.some((e) => e.exercise === exercise.id)) {
    emptyText = 'No body weight logged yet. Add yours in the top tile to see this.';
  } else if (me) emptyText = 'Nothing logged yet. Tap + to add the first one.';
  else emptyText = 'Nothing logged yet. Choose who you are to add the first one.';

  let yTickFormatter;
  if (mode === 'pct') yTickFormatter = (v) => `${v}%`;
  else if (perBw) yTickFormatter = (v) => `${v}×`;

  return (
    <ChartFrame
      headingId={`chart-${exercise.id}`}
      title={exercise.name}
      subtitle={subtitleFor(exercise, mode, equalise)}
      addLabel={`Log ${exercise.name}`}
      canAdd={Boolean(me)}
      onAdd={onAdd}
    >
      {(full) => (
        <LinesChart
          rows={rows}
          personIds={personIds}
          people={people}
          me={me}
          full={full}
          emptyText={emptyText}
          yTickFormatter={yTickFormatter}
          yWidth={mode === 'pct' ? 46 : 44}
          zeroLine={mode === 'pct'}
          tooltip={<ChartTooltip mode={mode} kind={exercise.kind} equalise={equalise} />}
        />
      )}
    </ChartFrame>
  );
}
