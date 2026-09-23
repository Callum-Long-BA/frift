import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DAY_MS, formatDay, pickTicks, seriesKey } from '../lib/metrics.js';
import { CHART } from '../lib/theme.js';

// One line per person over time, shared by every chart tile. The selected person's line is
// thicker and drawn on top; everyone else's is dimmed. `full` draws it bigger for the
// full-screen view. `reversed` flips the Y axis (used for pace, so faster is higher), and
// `yDomain` overrides the axis range (Recharts starts at 0 unless told otherwise).
export default function LinesChart({
  rows,
  personIds,
  people,
  me,
  tooltip,
  emptyText,
  yTickFormatter,
  yWidth = 44,
  reversed = false,
  yDomain,
  zeroLine = false,
  full = false,
}) {
  const drawn = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return personIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.id === me?.id) - Number(b.id === me?.id));
  }, [people, personIds, me]);

  const ticks = useMemo(() => pickTicks(rows, full ? 8 : 4), [rows, full]);

  if (rows.length === 0) return <p className="chart-empty">{emptyText}</p>;

  const fontSize = full ? 13 : 11;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[(min) => min - DAY_MS, (max) => max + DAY_MS]}
          ticks={ticks}
          tickFormatter={formatDay}
          tick={{ fontSize, fill: CHART.tick }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <YAxis
          width={full ? yWidth + 8 : yWidth}
          reversed={reversed}
          {...(yDomain ? { domain: yDomain } : {})}
          tick={{ fontSize, fill: CHART.tick }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yTickFormatter}
        />
        {zeroLine && <ReferenceLine y={0} stroke={CHART.zero} strokeDasharray="4 4" />}
        <Tooltip
          content={tooltip}
          cursor={{ stroke: CHART.cursor }}
          allowEscapeViewBox={{ x: false, y: true }}
          wrapperStyle={{ zIndex: 20, outline: 'none' }}
          isAnimationActive={false}
        />
        {drawn.map((person) => {
          const isMe = person.id === me?.id;
          const opacity = me && !isMe ? 0.3 : 1;
          const scale = full ? 1.25 : 1;
          return (
            <Line
              key={person.id}
              type="linear"
              dataKey={seriesKey(person.id)}
              name={person.name}
              stroke={person.colour}
              strokeWidth={(isMe ? 4 : 2) * scale}
              strokeOpacity={opacity}
              dot={{ r: (isMe ? 4 : 2.5) * scale, fill: person.colour, fillOpacity: opacity, strokeWidth: 0 }}
              activeDot={{ r: (isMe ? 6 : 4) * scale }}
              connectNulls
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
