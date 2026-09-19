import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../src/lib/constants.js';
import {
  buildChartData,
  dailyTotals,
  nextSetNumber,
  pickTicks,
  seriesKey,
} from '../src/lib/metrics.js';

const bench = EXERCISES.find((e) => e.id === 'bench_press');
const cardio = EXERCISES.find((e) => e.id === 'cardio');

let nextId = 1;
const set = (person_id, date, set_number, weight, reps, exercise = 'bench_press') => ({
  id: nextId++, person_id, exercise, date, set_number, weight, reps, duration_min: null,
});
const run = (person_id, date, duration_min) => ({
  id: nextId++, person_id, exercise: 'cardio', date, set_number: 1, weight: null, reps: null, duration_min,
});

test('only the last 3 sets of the day count', () => {
  const entries = [
    set(1, '2026-09-01', 1, 40, 10), // ignored
    set(1, '2026-09-01', 2, 50, 10), // ignored
    set(1, '2026-09-01', 3, 60, 8),  // 480
    set(1, '2026-09-01', 4, 60, 8),  // 480
    set(1, '2026-09-01', 5, 60, 6),  // 360
  ];
  assert.equal(dailyTotals(entries, bench).get(1).get('2026-09-01'), 480 + 480 + 360);
});

test('someone doing 5 sets is not ahead of someone doing 3 identical sets', () => {
  const three = [1, 2, 3].map((n) => set(1, '2026-09-01', n, 60, 8));
  const five = [1, 2, 3, 4, 5].map((n) => set(2, '2026-09-01', n, 60, 8));
  const totals = dailyTotals([...three, ...five], bench);
  assert.equal(totals.get(1).get('2026-09-01'), totals.get(2).get('2026-09-01'));
});

test('fewer than 3 sets sums what exists', () => {
  const entries = [set(1, '2026-09-01', 1, 100, 5), set(1, '2026-09-01', 2, 100, 4)];
  assert.equal(dailyTotals(entries, bench).get(1).get('2026-09-01'), 900);
});

test('"last" is by set number, not by row order', () => {
  const entries = [
    set(1, '2026-09-01', 4, 60, 8),
    set(1, '2026-09-01', 1, 10, 10),
    set(1, '2026-09-01', 3, 60, 8),
    set(1, '2026-09-01', 2, 60, 8),
  ];
  assert.equal(dailyTotals(entries, bench).get(1).get('2026-09-01'), 60 * 8 * 3);
});

test('other exercises and other people do not leak into a chart', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),
    set(1, '2026-09-01', 1, 100, 5, 'squat'),
    set(2, '2026-09-01', 1, 20, 10),
  ];
  const totals = dailyTotals(entries, bench);
  assert.equal(totals.get(1).get('2026-09-01'), 480);
  assert.equal(totals.get(2).get('2026-09-01'), 200);
});

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
