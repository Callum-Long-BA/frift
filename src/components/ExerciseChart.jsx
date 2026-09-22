import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { COUNTED_SETS } from '../lib/constants.js';
import {
  DAY_MS,
  buildChartData,
  formatAmount,
  formatDay,
  formatDayLong,
  pickTicks,
  seriesKey,
} from '../lib/metrics.js';
import { CHART } from '../lib/theme.js';

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
                  {mode === 'best' && kind === 'strength' && sets.find((s) => s.counts) && ` × ${sets.find((s) => s.counts).reps}`}
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
          {mode === 'best'
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
    if (mode === 'best') return 'Best set of the day, reps';
    return `Last ${COUNTED_SETS} sets, total reps`;
  }
  let text;
  if (mode === 'pct') text = 'Total weight, change since first log';
  else if (mode === 'best') text = 'Best set of the day, kg';
  else text = `Last ${COUNTED_SETS} sets, weight × reps, kg`;
  return equalise && exercise.equipment_choice ? `${text}. Dumbbells doubled.` : text;
}

export default function ExerciseChart({
  exercise,
  people,
  entries,
  me,
  mode,
  equalise = false,
  loading,
  onAdd,
}) {
  const colours = CHART;
  const { rows, personIds } = useMemo(
    () => buildChartData(entries, exercise, mode, { equalise }),
    [entries, exercise, mode, equalise],
  );

  // Draw the selected person last so their line sits on top of everyone else's.
  const drawn = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return personIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.id === me?.id) - Number(b.id === me?.id));
  }, [people, personIds, me]);

  const ticks = useMemo(() => pickTicks(rows), [rows]);

  const subtitle = subtitleFor(exercise, mode, equalise);

  const emptyText = loading
    ? 'Loading…'
    : me
      ? 'Nothing logged yet. Tap + to add the first one.'
      : 'Nothing logged yet. Choose who you are to add the first one.';

  const headingId = `chart-${exercise.id}`;

  return (
    <section className="panel chart-panel" aria-labelledby={headingId}>
      <header className="chart-head">
        <div>
          <h2 id={headingId}>{exercise.name}</h2>
          <p className="chart-sub">{subtitle}</p>
        </div>
        <span title={me ? `Log ${exercise.name}` : 'Choose who you are to log'}>
          <button type="button" className="add-btn" onClick={onAdd} disabled={!me} aria-label={`Log ${exercise.name}`}>
            +
          </button>
        </span>
      </header>

      <div className="chart-body">
        {rows.length === 0 ? (
          <p className="chart-empty">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colours.grid} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[(min) => min - DAY_MS, (max) => max + DAY_MS]}
                ticks={ticks}
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: colours.tick }}
                tickLine={false}
                axisLine={{ stroke: colours.axis }}
              />
              <YAxis
                width={mode === 'pct' ? 46 : 44}
                tick={{ fontSize: 11, fill: colours.tick }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (mode === 'pct' ? `${v}%` : v)}
              />
              {mode === 'pct' && <ReferenceLine y={0} stroke={colours.zero} strokeDasharray="4 4" />}
              <Tooltip
                content={<ChartTooltip mode={mode} kind={exercise.kind} equalise={equalise} />}
                cursor={{ stroke: colours.cursor }}
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 20, outline: 'none' }}
                isAnimationActive={false}
              />
              {drawn.map((person) => {
                const isMe = person.id === me?.id;
                const dimmed = Boolean(me) && !isMe;
                const opacity = dimmed ? 0.3 : 1;
                return (
                  <Line
                    key={person.id}
                    type="linear"
                    dataKey={seriesKey(person.id)}
                    name={person.name}
                    stroke={person.colour}
                    strokeWidth={isMe ? 4 : 2}
                    strokeOpacity={opacity}
                    dot={{ r: isMe ? 4 : 2.5, fill: person.colour, fillOpacity: opacity, strokeWidth: 0 }}
                    activeDot={{ r: isMe ? 6 : 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
