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

function ChartTooltip({ active, payload, label, mode, kind }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;
  return (
    <div className="tip">
      <p className="tip-date">{formatDayLong(label)}</p>
      <ul>
        {items.map((item) => (
          <li key={item.dataKey}>
            <span className="swatch" style={{ background: item.color ?? item.stroke }} aria-hidden="true" />
            <span className="tip-name">{item.name}</span>
            <span className="tip-value">{formatAmount(item.value, mode, kind)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
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

  const subtitle =
    mode === 'pct'
      ? 'Change since your first log'
      : exercise.kind === 'cardio'
        ? 'Minutes per day'
        : `Last ${COUNTED_SETS} sets, weight × reps, kg`;

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
              <Tooltip content={<ChartTooltip mode={mode} kind={exercise.kind} />} cursor={{ stroke: '#9AA1A9' }} />
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
