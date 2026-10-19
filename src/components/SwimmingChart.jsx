import { useMemo, useState } from 'react';
import { SWIM_VIEWS } from '../lib/constants.js';
import { formatDayLong, formatDuration, formatSwimPace, swimChartData, swimPace } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

const VIEW_KEY = 'frift.swimView';

const km = (n) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })} km`;

// One swim as text: "20 lengths (0.5 km) in 8:30 (1:42 /100m)". Older swims (or any logged
// before lengths were saved) show the distance only: "0.5 km in 8:30 (1:42 /100m)".
export const swimText = (r) => {
  const distance = r.lengths ? `${r.lengths} ${r.lengths === 1 ? 'length' : 'lengths'} (${km(r.distanceKm)})` : km(r.distanceKm);
  return `${distance} in ${formatDuration(r.seconds)} (${formatSwimPace(swimPace(r.seconds, r.distanceKm))})`;
};

// Hover card: each person's value for that day, and every swim behind it.
function SwimTooltip({ active, payload, label, view }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (items.length === 0) return null;
  // Best first: furthest for distance, fastest pace for pace.
  items.sort((a, b) => (view === 'distance' ? b.value - a.value : a.value - b.value));

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
                <span className="tip-value">{view === 'distance' ? km(item.value) : formatSwimPace(item.value)}</span>
              </div>
              <p className="tip-sets">
                {swims.map((s, i) => (
                  <span key={s.setNumber} className="tip-set is-counted">
                    {i > 0 && <br />}
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
// swim counts), so a simple toggle switches the chart between the day's total distance and
// its average pace. The choice is remembered in this browser. The + button logs a swim.
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
  else if (me) emptyText = 'No swims yet. Tap + to log one.';
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
          reversed={view === 'pace'}
          yDomain={view === 'pace' ? ['auto', 'auto'] : undefined}
          yTickFormatter={view === 'pace' ? (v) => formatDuration(v) : (v) => `${v}`}
          tooltip={<SwimTooltip view={view} />}
        />
      )}
    </ChartFrame>
  );
}
