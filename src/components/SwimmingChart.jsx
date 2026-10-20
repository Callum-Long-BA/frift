import { useMemo, useState } from 'react';
import { SWIM_STROKE_LABELS, SWIM_VIEWS } from '../lib/constants.js';
import { formatDayLong, formatDuration, formatSwimPace, swimChartData, swimPace } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

const VIEW_KEY = 'frift.swimView';

const km = (n) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })} km`;

// One swim as text: "20 lengths (0.5 km) in 8:30 (1:42 /100m)", then any details recorded:
// "· Freestyle · HR 142 avg, 165 max · SWOLF 38". Older swims (or any logged before lengths
// were saved) show the distance only: "0.5 km in 8:30 (1:42 /100m)".
export const swimText = (r) => {
  const distance = r.lengths ? `${r.lengths} ${r.lengths === 1 ? 'length' : 'lengths'} (${km(r.distanceKm)})` : km(r.distanceKm);
  const parts = [`${distance} in ${formatDuration(r.seconds)} (${formatSwimPace(swimPace(r.seconds, r.distanceKm))})`];
  if (r.stroke) parts.push(SWIM_STROKE_LABELS[r.stroke] ?? r.stroke);
  if (r.avgHr || r.maxHr) parts.push(`HR ${[r.avgHr && `${r.avgHr} avg`, r.maxHr && `${r.maxHr} max`].filter(Boolean).join(', ')}`);
  if (r.swolf) parts.push(`SWOLF ${r.swolf}`);
  return parts.join(' · ');
};

// A swim as stored (an entries row) in the shape swimText takes.
export const swimOf = (e) => ({
  distanceKm: e.distance_km,
  seconds: e.duration_sec,
  lengths: e.lengths,
  stroke: e.stroke,
  avgHr: e.avg_hr,
  maxHr: e.max_hr,
  swolf: e.swolf,
});

// What a chart value means in each view, for the hover card.
function viewValue(view, value) {
  if (view === 'distance') return km(value);
  if (view === 'pace') return formatSwimPace(value);
  if (view === 'hr') return `${value} bpm`;
  return `SWOLF ${value}`;
}

// Hover card: each person's value for that day, and every swim behind it.
function SwimTooltip({ active, payload, label, view }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (items.length === 0) return null;
  // Best first: furthest for distance; lowest for pace and SWOLF; heart rate highest first.
  items.sort((a, b) => (view === 'distance' || view === 'hr' ? b.value - a.value : a.value - b.value));

  return (
    <div className="tip">
      <p className="tip-date">{formatDayLong(label)}</p>
      <ul>
        {items.map((item) => {
          const swims = item.payload?.detail?.[item.dataKey] ?? [];
          return (
            <li key={item.dataKey}>
              <div className="tip-line">
                <span className="swatch" style={{ background: item.color ?? item.stroke }} aria-hidden="true" />
                <span className="tip-name">{item.name}</span>
                <span className="tip-value">{viewValue(view, item.value)}</span>
              </div>
              <p className="tip-sets">
                {swims.map((s, i) => (
                  <span key={s.setNumber} className="tip-set is-counted">
                    {i > 0 && <br />}
                    {swims.length > 1 && `${i + 1}. `}
                    {swimText(s)}
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

// The Swimming tile. Unlike Running, there is nothing to pick between when logging (every
// swim counts), so a toggle switches the chart between the day's total distance, average
// pace, average heart rate and SWOLF (the last two only from swims that recorded them). The
// choice is remembered in this browser. The + button logs a swim.
export default function SwimmingChart({ exercise, people, entries, me, loading, onAdd, axisStart }) {
  const [view, setView] = useState(() => {
    const stored = readStored(VIEW_KEY);
    return SWIM_VIEWS.some((v) => v.key === stored) ? stored : 'distance';
  });

  const { rows, personIds } = useMemo(() => swimChartData(entries, view), [entries, view]);

  function changeView(next) {
    setView(next);
    writeStored(VIEW_KEY, next);
  }

  let emptyText;
  if (loading) emptyText = 'Loading…';
  else if (view === 'hr' || view === 'swolf') {
    const what = view === 'hr' ? 'heart rate' : 'SWOLF';
    emptyText = me ? `No swims with ${what} yet. Add it when you log a swim.` : `No swims with ${what} yet.`;
  } else if (me) emptyText = 'No swims yet. Tap + to log one.';
  else emptyText = 'No swims yet. Choose who you are to log one.';

  const controls = (
    <div className="segmented" role="group" aria-label="What the Swimming chart shows">
      {SWIM_VIEWS.map((v) => (
        <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => changeView(v.key)}>
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <ChartFrame
      headingId={`chart-${exercise.id}`}
      title={exercise.name}
      subtitle={SWIM_VIEWS.find((v) => v.key === view).subtitle}
      controls={controls}
      addLabel="Log a swim"
      canAdd={Boolean(me)}
      onAdd={onAdd}
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
          reversed={view === 'pace' || view === 'swolf'}
          yDomain={view === 'distance' ? undefined : ['auto', 'auto']}
          yTickFormatter={view === 'pace' ? (v) => formatDuration(v) : (v) => `${v}`}
          tooltip={<SwimTooltip view={view} />}
        />
      )}
    </ChartFrame>
  );
}
