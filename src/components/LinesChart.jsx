import { useMemo, useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_RANGES, TILE_RANGE } from '../lib/constants.js';
import { DAY_MS, chartRangeStart, formatDay, pickTicks, seriesKey, todayString } from '../lib/metrics.js';
import { CHART } from '../lib/theme.js';

// One line per person over time, shared by every chart tile. The selected person's line is
// thicker and drawn on top; everyone else's is dimmed. `reversed` flips the Y axis (used for
// pace, so faster is higher), and `yDomain` overrides the axis range (Recharts starts at 0
// unless told otherwise).
//
// On a tile it shows the last 8 weeks. With `full` (the expanded view) it starts on
// everything, drawn bigger, with range buttons (8W, 3M, 6M, 1Y, All) and a slider under the
// chart whose handles zoom into any stretch of dates.
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
  const [range, setRange] = useState('all');
  const [zoom, setZoom] = useState(null); // { startIndex, endIndex } from the slider
  const [resets, setResets] = useState(0); // bumping this redraws the slider at full width

  const drawn = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return personIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.id === me?.id) - Number(b.id === me?.id));
  }, [people, personIds, me]);

  const from = chartRangeStart(todayString(), full ? range : TILE_RANGE);
  const shown = useMemo(() => (from ? rows.filter((r) => r.date >= from) : rows), [rows, from]);
  const zoomed = full && zoom ? shown.slice(zoom.startIndex, zoom.endIndex + 1) : shown;
  const ticks = useMemo(() => pickTicks(zoomed, full ? 8 : 4), [zoomed, full]);

  if (rows.length === 0) return <p className="chart-empty">{emptyText}</p>;

  function resetZoom() {
    setZoom(null);
    setResets((n) => n + 1);
  }

  function changeRange(next) {
    setRange(next);
    resetZoom();
  }

  const fontSize = full ? 13 : 11;
  const chart =
    shown.length === 0 ? (
      <p className="chart-empty">
        {full ? 'Nothing logged in this range. Try a longer one.' : 'Nothing in the last 8 weeks. Expand the chart to see everything.'}
      </p>
    ) : (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={shown} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
          {full && shown.length > 2 && (
            <Brush
              key={`${range}-${resets}`}
              dataKey="t"
              height={28}
              travellerWidth={10}
              stroke={CHART.cursor}
              fill="transparent"
              tickFormatter={formatDay}
              startIndex={zoom?.startIndex}
              endIndex={zoom?.endIndex}
              onChange={({ startIndex, endIndex }) => setZoom({ startIndex, endIndex })}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    );

  if (!full) return chart;

  return (
    <div className="zoom-chart">
      <div className="zoom-bar">
        <div className="segmented" role="group" aria-label="Date range">
          {CHART_RANGES.map((r) => (
            <button key={r.key} type="button" title={r.title} aria-pressed={range === r.key} onClick={() => changeRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {shown.length > 2 && <span className="zoom-hint">Drag the handles under the chart to zoom in.</span>}
        {zoom && (
          <button type="button" className="text-btn" onClick={resetZoom}>
            Reset zoom
          </button>
        )}
      </div>
      <div className="zoom-plot">{chart}</div>
    </div>
  );
}
