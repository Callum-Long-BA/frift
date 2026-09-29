import { useMemo, useState } from 'react';
import { CARDIO_VIEWS } from '../lib/constants.js';
import { cardioChartData, cardioKm, formatDayLong } from '../lib/metrics.js';
import { readStored, writeStored } from '../lib/storage.js';
import ChartFrame from './ChartFrame.jsx';
import LinesChart from './LinesChart.jsx';

const VIEW_KEY = 'frift.cardioView';
const UNITS = { distance: 'km', time: 'min', speed: 'km/h', incline: '%', climb: 'm' };

const number = (n, digits = 1) => Number(n).toLocaleString('en-GB', { maximumFractionDigits: digits });

// One session as text: "30 min at 6.5 km/h, 8% incline (3.25 km)", or "30 min" for older
// entries logged before speed and incline were recorded.
export function cardioText(minutes, speed, incline) {
  if (!speed) return `${number(minutes)} min`;
  const km = cardioKm({ speed_kmh: speed, duration_min: minutes });
  return `${number(minutes)} min at ${number(speed)} km/h, ${number(incline ?? 0)}% incline (${number(km, 2)} km)`;
}

// Hover card: each person's value for that day and the sessions behind it.
function CardioTooltip({ active, payload, label, view }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;
  return (
    <div className="tip">
      <p className="tip-date">{formatDayLong(label)}</p>
      <ul>
        {items.map((item) => {
          const sessions = item.payload?.detail?.[item.dataKey] ?? [];
          return (
            <li key={item.dataKey}>
              <div className="tip-line">
                <span className="swatch" style={{ background: item.color ?? item.stroke }} aria-hidden="true" />
                <span className="tip-name">{item.name}</span>
                <span className="tip-value">
                  {number(item.value, 2)} {UNITS[view]}
                </span>
              </div>
              <p className="tip-sets">
                {sessions.map((s, i) => (
                  <span key={i} className="tip-set is-counted">
                    {i > 0 && <br />}
                    {cardioText(s.minutes, s.speed, s.incline)}
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

// The Cardio tile. Each session records speed, incline and minutes; a dropdown picks what is
// charted: distance (speed x time), time, average speed, average incline, or height climbed.
// The choice is remembered in this browser. Older minutes-only sessions only appear under Time.
export default function CardioChart({ exercise, people, entries, me, loading, onAdd, axisStart }) {
  const [view, setView] = useState(() => {
    const stored = readStored(VIEW_KEY);
    return CARDIO_VIEWS.some((v) => v.key === stored) ? stored : 'distance';
  });
  const { rows, personIds } = useMemo(() => cardioChartData(entries, view), [entries, view]);

  function changeView(next) {
    setView(next);
    writeStored(VIEW_KEY, next);
  }

  let emptyText;
  if (loading) emptyText = 'Loading…';
  else if (!me) emptyText = 'No cardio yet. Choose who you are to log some.';
  else if (view === 'time') emptyText = 'No cardio yet. Tap + to log some.';
  else emptyText = 'No cardio with speed and incline yet. Tap + to log some.';

  const controls = (
    <select className="run-select" value={view} onChange={(e) => changeView(e.target.value)} aria-label="What the Cardio chart shows">
      {CARDIO_VIEWS.map((v) => (
        <option key={v.key} value={v.key}>
          {v.label}
        </option>
      ))}
    </select>
  );

  return (
    <ChartFrame
      headingId={`chart-${exercise.id}`}
      title={exercise.name}
      subtitle={CARDIO_VIEWS.find((v) => v.key === view).subtitle}
      controls={controls}
      addLabel={`Log ${exercise.name}`}
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
          yTickFormatter={(v) => `${v}`}
          tooltip={<CardioTooltip view={view} />}
        />
      )}
    </ChartFrame>
  );
}
