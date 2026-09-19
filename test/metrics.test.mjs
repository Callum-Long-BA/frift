import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChartData,
  dailySummaries,
  nextSetNumber,
  pickTicks,
  seriesKey,
} from '../src/lib/metrics.js';

const bench = { id: 'bench_press', name: 'Bench press', kind: 'strength' };
const cardio = { id: 'cardio', name: 'Cardio', kind: 'cardio' };

let nextId = 1;
const set = (person_id, date, set_number, weight, reps, exercise = 'bench_press') => ({
  id: nextId++, person_id, exercise, date, set_number, weight, reps, duration_min: null,
});
const run = (person_id, date, duration_min) => ({
  id: nextId++, person_id, exercise: 'cardio', date, set_number: 1, weight: null, reps: null, duration_min,
});
const value = (entries, exercise, person, date, mode = 'total') =>
  dailySummaries(entries, exercise, mode).get(person).get(date).value;

// ---------- total weight ----------

test('only the last 3 sets of the day count', () => {
  const entries = [
    set(1, '2026-09-01', 1, 40, 10), // ignored
    set(1, '2026-09-01', 2, 50, 10), // ignored
    set(1, '2026-09-01', 3, 60, 8),  // 480
    set(1, '2026-09-01', 4, 60, 8),  // 480
    set(1, '2026-09-01', 5, 60, 6),  // 360
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01'), 480 + 480 + 360);
});

test('someone doing 5 sets is not ahead of someone doing 3 identical sets', () => {
  const three = [1, 2, 3].map((n) => set(1, '2026-09-01', n, 60, 8));
  const five = [1, 2, 3, 4, 5].map((n) => set(2, '2026-09-01', n, 60, 8));
  const all = [...three, ...five];
  assert.equal(value(all, bench, 1, '2026-09-01'), value(all, bench, 2, '2026-09-01'));
});

test('fewer than 3 sets sums what exists', () => {
  const entries = [set(1, '2026-09-01', 1, 100, 5), set(1, '2026-09-01', 2, 100, 4)];
  assert.equal(value(entries, bench, 1, '2026-09-01'), 900);
});

test('"last" is by set number, not by row order', () => {
  const entries = [
    set(1, '2026-09-01', 4, 60, 8),
    set(1, '2026-09-01', 1, 10, 10),
    set(1, '2026-09-01', 3, 60, 8),
    set(1, '2026-09-01', 2, 60, 8),
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01'), 60 * 8 * 3);
});

test('other exercises and other people do not leak into a chart', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),
    set(1, '2026-09-01', 1, 100, 5, 'squat'),
    set(2, '2026-09-01', 1, 20, 10),
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01'), 480);
  assert.equal(value(entries, bench, 2, '2026-09-01'), 200);
});

test('a custom exercise charts the same way as the originals', () => {
  const rdl = { id: 'romanian_deadlift', name: 'Romanian deadlift', kind: 'strength' };
  const entries = [1, 2, 3, 4].map((n) => set(1, '2026-09-01', n, 80, 8, 'romanian_deadlift'));
  assert.equal(value(entries, rdl, 1, '2026-09-01'), 80 * 8 * 3);
});

// ---------- best set ----------

test('best set is the single set with the highest weight x reps', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),  // 480
    set(1, '2026-09-01', 2, 70, 8),  // 560  <- best
    set(1, '2026-09-01', 3, 60, 6),  // 360
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 560);
});

test('best set looks at ALL sets of the day, not just the last 3', () => {
  const entries = [
    set(1, '2026-09-01', 1, 80, 10), // 800  <- best, but early
    set(1, '2026-09-01', 2, 60, 8),
    set(1, '2026-09-01', 3, 60, 8),
    set(1, '2026-09-01', 4, 60, 8),
    set(1, '2026-09-01', 5, 50, 8),
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 800);
  assert.equal(value(entries, bench, 1, '2026-09-01', 'total'), 480 + 480 + 400);
});

test('best set can favour more reps over more weight', () => {
  const entries = [set(1, '2026-09-01', 1, 100, 3), set(1, '2026-09-01', 2, 60, 8)];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 480); // 60x8 beats 100x3
});

test('best mode charts one point per day using the best set', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-01', 2, 70, 8),
    set(1, '2026-09-08', 1, 65, 8),
  ];
  const { rows } = buildChartData(entries, bench, 'best');
  assert.deepEqual(rows.map((r) => r[seriesKey(1)]), [560, 520]);
});

test('cardio is minutes in best mode too', () => {
  const entries = [run(1, '2026-09-01', 25)];
  const { rows } = buildChartData(entries, cardio, 'best');
  assert.equal(rows[0][seriesKey(1)], 25);
});

// ---------- tooltip detail: every set ----------

test('each data point carries every set that person did that day, in order', () => {
  const entries = [
    set(1, '2026-09-01', 3, 60, 6),
    set(1, '2026-09-01', 1, 40, 10),
    set(1, '2026-09-01', 2, 60, 8),
    set(1, '2026-09-01', 4, 62.5, 5),
  ];
  const { rows } = buildChartData(entries, bench, 'total');
  const sets = rows[0].detail[seriesKey(1)];
  assert.deepEqual(sets.map((s) => [s.setNumber, s.weight, s.reps]), [
    [1, 40, 10], [2, 60, 8], [3, 60, 6], [4, 62.5, 5],
  ]);
});

test('in total mode the last 3 sets are flagged as counting', () => {
  const entries = [1, 2, 3, 4, 5].map((n) => set(1, '2026-09-01', n, 60, 8));
  const sets = buildChartData(entries, bench, 'total').rows[0].detail[seriesKey(1)];
  assert.deepEqual(sets.map((s) => s.counts), [false, false, true, true, true]);
});

test('in best mode only the best set is flagged as counting', () => {
  const entries = [set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-01', 2, 70, 8), set(1, '2026-09-01', 3, 60, 6)];
  const sets = buildChartData(entries, bench, 'best').rows[0].detail[seriesKey(1)];
  assert.deepEqual(sets.map((s) => s.counts), [false, true, false]);
});

test('detail is kept per person, so the tooltip never mixes people up', () => {
  const entries = [set(1, '2026-09-01', 1, 60, 8), set(2, '2026-09-01', 1, 20, 10), set(2, '2026-09-01', 2, 25, 10)];
  const { rows } = buildChartData(entries, bench, 'total');
  assert.equal(rows[0].detail[seriesKey(1)].length, 1);
  assert.equal(rows[0].detail[seriesKey(2)].length, 2);
});

test('cardio points have no set detail', () => {
  const { rows } = buildChartData([run(1, '2026-09-01', 30)], cardio, 'total');
  assert.deepEqual(rows[0].detail, {});
});

test('% mode still carries set detail', () => {
  const entries = [set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-08', 1, 66, 8)];
  const { rows } = buildChartData(entries, bench, 'pct');
  assert.equal(rows[1].detail[seriesKey(1)][0].weight, 66);
});

// ---------- % change and layout ----------

test('cardio uses minutes', () => {
  const entries = [run(1, '2026-09-01', 25), run(1, '2026-09-03', 30)];
  const { rows } = buildChartData(entries, cardio, 'total');
  assert.deepEqual(rows.map((r) => r[seriesKey(1)]), [25, 30]);
});

test('% change is measured from each person\'s own first day', () => {
  const entries = [
    set(1, '2026-09-01', 1, 100, 10),
    set(1, '2026-09-08', 1, 110, 10),
    set(2, '2026-09-03', 1, 20, 10),
    set(2, '2026-09-10', 1, 30, 10),
  ];
  const { rows } = buildChartData(entries, bench, 'pct');
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  assert.equal(byDate['2026-09-01'][seriesKey(1)], 0);
  assert.equal(byDate['2026-09-08'][seriesKey(1)], 10);
  assert.equal(byDate['2026-09-03'][seriesKey(2)], 0);
  assert.equal(byDate['2026-09-10'][seriesKey(2)], 50);
});

test('people logging on different days share one sorted x axis with gaps as null', () => {
  const entries = [set(1, '2026-09-08', 1, 50, 10), set(2, '2026-09-01', 1, 40, 10)];
  const { rows, personIds } = buildChartData(entries, bench, 'total');
  assert.deepEqual(rows.map((r) => r.date), ['2026-09-01', '2026-09-08']);
  assert.equal(rows[0][seriesKey(1)], null);
  assert.equal(rows[1][seriesKey(2)], null);
  assert.deepEqual(personIds.sort(), [1, 2]);
});

test('a person whose first value is zero is skipped in % mode instead of dividing by zero', () => {
  const entries = [set(1, '2026-09-01', 1, 0, 10), set(1, '2026-09-08', 1, 10, 10)];
  const { personIds } = buildChartData(entries, bench, 'pct');
  assert.deepEqual(personIds, []);
});

test('nextSetNumber continues from the highest set that day', () => {
  const entries = [set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-01', 2, 60, 8), set(2, '2026-09-01', 1, 60, 8)];
  assert.equal(nextSetNumber(entries, 1, 'bench_press', '2026-09-01'), 3);
  assert.equal(nextSetNumber(entries, 1, 'bench_press', '2026-09-02'), 1);
  assert.equal(nextSetNumber(entries, 1, 'squat', '2026-09-01'), 1);
});

test('pickTicks returns real dates, at most 4', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ t: i * 1000 }));
  const ticks = pickTicks(rows, 4);
  assert.equal(ticks.length, 4);
  assert.ok(ticks.every((t) => rows.some((r) => r.t === t)));
  assert.equal(ticks[0], 0);
  assert.equal(ticks[3], 29000);
  assert.equal(pickTicks([], 4), undefined);
});
