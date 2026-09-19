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

// Hover card: everyone's value for that day, plus every set they did.
// Sets that count toward the chart in the current mode are bold; the rest are faded.
export function ChartTooltip({ active, payload, label, mode, kind }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;

  const setsFor = (item) => item.payload?.detail?.[item.dataKey] ?? [];
  const anyFaded = items.some((item) => setsFor(item).some((s) => !s.counts));

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
                <span className="tip-value">{formatAmount(item.value, mode, kind)}</span>
              </div>
              {sets.length > 0 && (
                <p className="tip-sets">
                  <span className="tip-sets-label">Sets</span>
                  {sets.map((s, i) => (
                    <span key={s.setNumber} className={s.counts ? 'tip-set is-counted' : 'tip-set'}>
                      {i > 0 && ', '}
                      {s.weight}×{s.reps}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
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

function subtitleFor(exercise, mode) {
  if (exercise.kind === 'cardio') return mode === 'pct' ? 'Minutes, change since first log' : 'Minutes per day';
  if (mode === 'pct') return 'Total weight, change since first log';
  if (mode === 'best') return 'Best set of the day, weight × reps, kg';
  return `Last ${COUNTED_SETS} sets, weight × reps, kg`;
}

export default function ExerciseChart({ exercise, people, entries, me, mode, loading, onAdd }) {
  const { rows, personIds } = useMemo(() => buildChartData(entries, exercise, mode), [entries, exercise, mode]);

  // Draw the selected person last so their line sits on top of everyone else's.
  const drawn = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return personIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.id === me?.id) - Number(b.id === me?.id));
  }, [people, personIds, me]);

  const ticks = useMemo(() => pickTicks(rows), [rows]);

  const subtitle = subtitleFor(exercise, mode);

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
              <CartesianGrid stroke="#E4E7EA" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[(min) => min - DAY_MS, (max) => max + DAY_MS]}
                ticks={ticks}
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: '#5B636D' }}
                tickLine={false}
                axisLine={{ stroke: '#C9CED3' }}
              />
              <YAxis
                width={mode === 'pct' ? 46 : 44}
                tick={{ fontSize: 11, fill: '#5B636D' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (mode === 'pct' ? `${v}%` : v)}
              />
              {mode === 'pct' && <ReferenceLine y={0} stroke="#9AA1A9" strokeDasharray="4 4" />}
              <Tooltip
                content={<ChartTooltip mode={mode} kind={exercise.kind} />}
                cursor={{ stroke: '#9AA1A9' }}
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
