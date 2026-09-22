import { useMemo } from 'react';
import { ACTIVITY_WEEKS } from '../lib/constants.js';
import { activityByPerson, dayLabel, todayString, weekGrid } from '../lib/metrics.js';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Grid column for day number i (0-based across all weeks). Column 1 holds the names,
// and there is a narrow spacer column between weeks, so each week starts 1 column further along.
const columnFor = (i) => 2 + i + Math.floor(i / 7);

// One row per person, one box per day for the last few weeks. A box is filled in that
// person's colour on days they logged anything. Today's column is outlined.
// It sits inside the control tile, beside the controls: the boxes stretch to the space
// available, and when that is narrow the names shrink to their first few letters (see the
// container query in styles.css).
export default function ActivityStrip({ people, entries, exercises, me }) {
  const today = todayString();
  const days = useMemo(() => weekGrid(today, ACTIVITY_WEEKS), [today]);
  const activity = useMemo(
    () => activityByPerson(entries, days[0].date, days[days.length - 1].date),
    [entries, days],
  );
  const exerciseName = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const todayIndex = days.findIndex((d) => d.isToday);
  const firstPersonRow = 3; // row 1 = week dates, row 2 = weekday letters

  return (
    <section className="activity" aria-labelledby="activity-title">
      <header>
        <h2 id="activity-title">Last {ACTIVITY_WEEKS} weeks</h2>
        <p className="chart-sub">Days with a set or cardio logged. Hover a box for details.</p>
      </header>

      {people.length === 0 ? (
        <p className="chart-empty">Add yourself to start the record.</p>
      ) : (
        <div className="act-grid" role="group" aria-label={`Days logged in the last ${ACTIVITY_WEEKS} weeks`}>
          {Array.from({ length: ACTIVITY_WEEKS }, (_, w) => (
            <span key={`w${w}`} className="act-week" style={{ gridColumn: `${columnFor(w * 7)} / span 7`, gridRow: 1 }}>
              {dayLabel(days[w * 7].date).replace(/^\w+ /, '')}
            </span>
          ))}

          {days.map((day, i) => (
            <span
              key={`d${day.date}`}
              className={day.isToday ? 'act-dow is-today' : 'act-dow'}
              style={{ gridColumn: columnFor(i), gridRow: 2 }}
              aria-hidden="true"
            >
              {WEEKDAYS[day.dayOfWeek]}
            </span>
          ))}

          {people.map((person, r) => {
            const isMe = me?.id === person.id;
            const row = firstPersonRow + r;
            const byDate = activity.get(person.id);
            const loggedCount = days.filter((d) => byDate?.has(d.date)).length;
            return [
              <span key={`n${person.id}`} className={isMe ? 'act-name is-me' : 'act-name'} style={{ gridColumn: 1, gridRow: row }} title={person.name}>
                <span className="act-name-full" aria-hidden="true">
                  {person.name}
                </span>
                <span className="act-name-short" aria-hidden="true">
                  {person.name.slice(0, 3)}
                </span>
                <span className="sr-only">
                  {person.name}
                  {' '}
                  logged on {loggedCount} of the last {days.filter((d) => !d.isFuture).length} days.
                </span>
              </span>,
              ...days.map((day, i) => {
                const exerciseIds = byDate?.get(day.date);
                const style = { gridColumn: columnFor(i), gridRow: row };
                if (exerciseIds) {
                  const what = [...exerciseIds].map((id) => exerciseName.get(id) ?? id).join(', ');
                  const label = `${person.name}, ${dayLabel(day.date)}: ${what}`;
                  return (
                    <span
                      key={`${person.id}-${day.date}`}
                      className="act-cell is-logged"
                      data-date={day.date}
                      style={{ ...style, background: person.colour }}
                      title={label}
                      aria-label={label}
                      role="img"
                    />
                  );
                }
                return (
                  <span
                    key={`${person.id}-${day.date}`}
                    className={day.isFuture ? 'act-cell is-upcoming' : 'act-cell'}
                    data-date={day.date}
                    style={style}
                    aria-hidden="true"
                  />
                );
              }),
            ];
          })}

          {todayIndex > -1 && (
            <span
              className="act-today"
              data-testid="act-today"
              style={{ gridColumn: columnFor(todayIndex), gridRow: `2 / span ${people.length + 1}` }}
              aria-hidden="true"
            />
          )}
        </div>
      )}

      <p className="act-key" aria-hidden="true">
        <span>
          <i className="key-box is-logged" /> Logged
        </span>
        <span>
          <i className="key-box" /> Not logged
        </span>
        <span>
          <i className="key-box is-upcoming" /> To come
        </span>
      </p>
    </section>
  );
}
