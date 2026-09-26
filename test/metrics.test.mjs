import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChartData,
  dailySummaries,
  nextSetNumber,
  pickTicks,
  seriesKey,
  formatAmount,
  activityByPerson,
  dayLabel,
  weekGrid,
  recentSessions,
  chartRangeStart,
  splitAtGaps,
  evenTicks,
  bodyWeightOn,
  runningChartData,
  formatDuration,
  formatPace,
  matchesTempoDistance,
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

test('best set plots the WEIGHT of the set with the highest weight x reps', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),  // 480
    set(1, '2026-09-01', 2, 70, 8),  // 560  <- best, so y = 70
    set(1, '2026-09-01', 3, 60, 6),  // 360
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 70);
});

test('best set looks at ALL sets of the day, not just the last 3', () => {
  const entries = [
    set(1, '2026-09-01', 1, 80, 10), // 800  <- best, but early
    set(1, '2026-09-01', 2, 60, 8),
    set(1, '2026-09-01', 3, 60, 8),
    set(1, '2026-09-01', 4, 60, 8),
    set(1, '2026-09-01', 5, 50, 8),
  ];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 80); // the early 80x10 set (800)
  assert.equal(value(entries, bench, 1, '2026-09-01', 'total'), 480 + 480 + 400);
});

test('best set is chosen by weight x reps, so 60x8 beats 100x3 and y shows 60', () => {
  const entries = [set(1, '2026-09-01', 1, 100, 3), set(1, '2026-09-01', 2, 60, 8)];
  assert.equal(value(entries, bench, 1, '2026-09-01', 'best'), 60);
  const sets = buildChartData(entries, bench, 'best').rows[0].detail[seriesKey(1)];
  assert.equal(sets.find((s) => s.counts).reps, 8); // shown in the hover card
});

test('best mode charts one point per day using the best set', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-01', 2, 70, 8),
    set(1, '2026-09-08', 1, 65, 8),
  ];
  const { rows } = buildChartData(entries, bench, 'best');
  assert.deepEqual(rows.map((r) => r[seriesKey(1)]), [70, 65]);
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

// ---------- barbell / dumbbell and "equalise" ----------

const db = (person_id, date, set_number, weight, reps) => ({
  ...set(person_id, date, set_number, weight, reps), equipment: 'dumbbell',
});
const bb = (person_id, date, set_number, weight, reps) => ({
  ...set(person_id, date, set_number, weight, reps), equipment: 'barbell',
});


test('equalise off: dumbbell weight is used as logged', () => {
  const entries = [db(1, '2026-09-01', 1, 30, 10)];
  assert.equal(dailySummaries(entries, bench, 'total').get(1).get('2026-09-01').value, 300);
});

test('equalise on: dumbbell sets count at double, barbell sets do not', () => {
  const entries = [
    db(1, '2026-09-01', 1, 30, 10), // 30 each -> 60 -> 600
    bb(2, '2026-09-01', 1, 60, 10), // 600
  ];
  const s = dailySummaries(entries, bench, 'total', { equalise: true });
  assert.equal(s.get(1).get('2026-09-01').value, 600);
  assert.equal(s.get(2).get('2026-09-01').value, 600);
});

test('sets with no equipment recorded count as barbell, even with equalise on', () => {
  const entries = [set(1, '2026-09-01', 1, 60, 10)];
  assert.equal(dailySummaries(entries, bench, 'total', { equalise: true }).get(1).get('2026-09-01').value, 600);
});

test('equalise applies set by set when a day mixes barbell and dumbbell', () => {
  const entries = [bb(1, '2026-09-01', 1, 60, 10), db(1, '2026-09-01', 2, 30, 10)];
  assert.equal(dailySummaries(entries, bench, 'total', { equalise: true }).get(1).get('2026-09-01').value, 600 + 600);
  assert.equal(dailySummaries(entries, bench, 'total').get(1).get('2026-09-01').value, 600 + 300);
});

test('equalise changes which set is best', () => {
  const entries = [bb(1, '2026-09-01', 1, 50, 10), db(1, '2026-09-01', 2, 30, 10)]; // 500 vs 300 (or 600 doubled)
  // Off: the barbell set wins, so y = 50. On: the dumbbell set counts as 60 x 10 and wins, so y = 60.
  assert.equal(dailySummaries(entries, bench, 'best').get(1).get('2026-09-01').value, 50);
  assert.equal(dailySummaries(entries, bench, 'best', { equalise: true }).get(1).get('2026-09-01').value, 60);
});

test('% change: switching from barbell to dumbbell is flat once equalised', () => {
  const entries = [bb(1, '2026-09-01', 1, 60, 8), db(1, '2026-09-08', 1, 30, 8)];
  const off = buildChartData(entries, bench, 'pct').rows;
  const on = buildChartData(entries, bench, 'pct', { equalise: true }).rows;
  assert.equal(off[1][seriesKey(1)], -50);
  assert.equal(on[1][seriesKey(1)], 0);
});

test('tooltip detail keeps the logged weight and the equipment, plus the factor used', () => {
  const entries = [db(1, '2026-09-01', 1, 30, 10)];
  const [detail] = buildChartData(entries, bench, 'total', { equalise: true }).rows[0].detail[seriesKey(1)];
  assert.equal(detail.weight, 30);
  assert.equal(detail.equipment, 'dumbbell');
  assert.equal(detail.factor, 2);
  const [off] = buildChartData(entries, bench, 'total').rows[0].detail[seriesKey(1)];
  assert.equal(off.factor, 1);
});

test('equalise never changes cardio', () => {
  const { rows } = buildChartData([run(1, '2026-09-01', 30)], cardio, 'total', { equalise: true });
  assert.equal(rows[0][seriesKey(1)], 30);
});

// ---------- reps-only exercises ----------

const pullups = { id: 'pull_ups', name: 'Pull ups', kind: 'reps' };
const repsSet = (person_id, date, set_number, reps) => set(person_id, date, set_number, null, reps, 'pull_ups');

test('reps only, total: sums the reps of the last 3 sets', () => {
  const entries = [1, 2, 3, 4].map((n, i) => repsSet(1, '2026-09-01', n, [20, 10, 8, 6][i]));
  assert.equal(value(entries, pullups, 1, '2026-09-01', 'total'), 10 + 8 + 6);
});

test('reps only, best: the most reps in one set, from all sets', () => {
  const entries = [1, 2, 3, 4].map((n, i) => repsSet(1, '2026-09-01', n, [20, 10, 8, 6][i]));
  assert.equal(value(entries, pullups, 1, '2026-09-01', 'best'), 20);
});

test('reps only, % change works from total reps, and equalise does nothing', () => {
  const entries = [repsSet(1, '2026-09-01', 1, 10), repsSet(1, '2026-09-03', 1, 15)];
  const { rows } = buildChartData(entries, pullups, 'pct', { equalise: true });
  assert.deepEqual(rows.map((r) => r[seriesKey(1)]), [0, 50]);
});

test('amounts are labelled in reps for reps-only exercises', () => {
  assert.equal(formatAmount(24, 'total', 'reps'), '24 reps');
  assert.equal(formatAmount(60, 'best', 'strength'), '60 kg');
  assert.equal(formatAmount(30, 'total', 'cardio'), '30 min');
});

test('best mode: one point per person per day, with that day\'s best reps kept for the hover card', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8), set(1, '2026-09-01', 2, 70, 5), // 480 vs 350 -> 60x8
    set(2, '2026-09-01', 1, 40, 12),
  ];
  const { rows } = buildChartData(entries, bench, 'best');
  const best = (key) => rows[0].detail[key].find((s) => s.counts);
  assert.equal(rows[0][seriesKey(1)], 60);
  assert.equal(best(seriesKey(1)).reps, 8);
  assert.equal(rows[0][seriesKey(2)], 40);
  assert.equal(best(seriesKey(2)).reps, 12);
});

// ---------- activity strip ----------

test('weekGrid: 3 Monday-to-Sunday weeks ending with the current week', () => {
  const grid = weekGrid('2026-09-23', 3); // a Wednesday
  assert.equal(grid.length, 21);
  assert.equal(grid[0].date, '2026-09-07'); // a Monday, two weeks before this week's Monday
  assert.equal(grid[14].date, '2026-09-21'); // this week's Monday
  assert.equal(grid[20].date, '2026-09-27'); // this week's Sunday
  assert.ok(grid.every((d, i) => d.dayOfWeek === i % 7 && d.week === Math.floor(i / 7)));
});

test('weekGrid: on a Monday, today is the first box of the current week and 6 days are still to come', () => {
  const grid = weekGrid('2026-09-21', 3);
  const todayIndex = grid.findIndex((d) => d.isToday);
  assert.equal(todayIndex, 14);
  assert.equal(grid[todayIndex].dayOfWeek, 0);
  assert.equal(grid.filter((d) => d.isFuture).length, 6);
  assert.ok(grid.slice(14 + 1).every((d) => d.isFuture));
});

test('weekGrid: on a Sunday, today is the last box and nothing is still to come', () => {
  const grid = weekGrid('2026-09-20', 3);
  assert.equal(grid.findIndex((d) => d.isToday), 20);
  assert.equal(grid.filter((d) => d.isFuture).length, 0);
  assert.equal(grid[0].date, '2026-08-31');
});

test('weekGrid crosses month and year boundaries correctly', () => {
  const grid = weekGrid('2026-01-01', 3); // a Thursday
  assert.equal(grid[0].date, '2025-12-15');
  assert.equal(grid[20].date, '2026-01-04');
  assert.equal(new Set(grid.map((d) => d.date)).size, 21);
});

test('activityByPerson counts any entry, merges exercises on the same day, and ignores dates outside the range', () => {
  const entries = [
    set(1, '2026-09-08', 1, 60, 8),
    set(1, '2026-09-08', 1, 100, 5, 'squat'),
    run(1, '2026-09-10', 30),
    set(1, '2026-08-01', 1, 60, 8), // before the range
    set(2, '2026-09-30', 1, 40, 10), // after the range
    set(2, '2026-09-09', 1, 40, 10),
  ];
  const a = activityByPerson(entries, '2026-09-07', '2026-09-27');
  assert.deepEqual([...a.get(1).keys()].sort(), ['2026-09-08', '2026-09-10']);
  assert.deepEqual([...a.get(1).get('2026-09-08')].sort(), ['bench_press', 'squat']);
  assert.deepEqual([...a.get(1).get('2026-09-10')], ['cardio']);
  assert.deepEqual([...a.get(2).keys()], ['2026-09-09']);
});

test('dayLabel is short and readable', () => {
  assert.match(dayLabel('2026-09-08'), /Tue/);
  assert.match(dayLabel('2026-09-08'), /8/);
});

// ---------- activity log ----------

const kinds = [bench, cardio, { id: 'pull_ups', name: 'Pull ups', kind: 'reps' }];

test('recentSessions groups by person and day, newest date first, and caps the count', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),
    set(2, '2026-09-02', 1, 40, 8),
    run(1, '2026-09-01', 20), // logged last, but its date is earlier, so it stays second
  ];
  const sessions = recentSessions(entries, kinds, 5);
  assert.deepEqual(sessions.map((s) => [s.personId, s.date]), [[2, '2026-09-02'], [1, '2026-09-01']]);
  assert.deepEqual(sessions[1].exerciseIds, ['bench_press', 'cardio']);
  assert.equal(recentSessions(entries, kinds, 1).length, 1);
});

test('recentSessions: a backdated session slots in by its date; same-date sessions go most recently logged first', () => {
  const entries = [
    set(1, '2026-09-10', 1, 60, 8),
    set(2, '2026-09-10', 1, 40, 8), // same date, logged after person 1
    set(3, '2026-08-01', 1, 50, 8), // logged last, but for August
  ];
  assert.deepEqual(recentSessions(entries, kinds, 5).map((s) => s.personId), [2, 1, 3]);
});

test('a PR is a heavier top weight than any earlier session; the first session is not a PR', () => {
  const entries = [
    set(1, '2026-09-01', 1, 60, 8),
    set(1, '2026-09-03', 1, 62.5, 3), // PR: heavier, even with fewer reps
    set(1, '2026-09-05', 1, 62.5, 8), // equal is not a PR
  ];
  const byDate = new Map(recentSessions(entries, kinds, 5).map((s) => [s.date, s.prs]));
  assert.deepEqual(byDate.get('2026-09-01'), []);
  assert.deepEqual(byDate.get('2026-09-03'), ['bench_press']);
  assert.deepEqual(byDate.get('2026-09-05'), []);
});

test('barbell and dumbbell records are kept apart; unrecorded equipment counts as barbell', () => {
  const db = (date, w) => ({ ...set(1, date, 1, w, 8), equipment: 'dumbbell' });
  const entries = [set(1, '2026-09-01', 1, 60, 8), db('2026-09-03', 25), db('2026-09-05', 27.5), { ...set(1, '2026-09-06', 1, 60, 8), equipment: 'barbell' }];
  const byDate = new Map(recentSessions(entries, kinds, 5).map((s) => [s.date, s.prs]));
  assert.deepEqual(byDate.get('2026-09-03'), []); // first dumbbell session
  assert.deepEqual(byDate.get('2026-09-05'), ['bench_press']);
  assert.deepEqual(byDate.get('2026-09-06'), []); // same as the earlier unrecorded (barbell) 60
});

test('reps-only PRs are the most total reps in a day; cardio PRs are the longest session', () => {
  const pull = (date, n) => set(1, date, 1, null, n, 'pull_ups');
  const entries = [pull('2026-09-01', 10), pull('2026-09-02', 12), run(1, '2026-09-01', 30), run(1, '2026-09-02', 25)];
  const [latest] = recentSessions(entries, kinds, 1);
  assert.equal(latest.date, '2026-09-02');
  assert.deepEqual(latest.prs, ['pull_ups']);
});

test('only earlier days count, not other people or later days', () => {
  const entries = [set(2, '2026-09-01', 1, 100, 5), set(1, '2026-09-02', 1, 50, 5), set(1, '2026-09-04', 1, 70, 5), set(1, '2026-09-03', 1, 60, 5)];
  const byDate = new Map(recentSessions(entries, kinds, 5).filter((s) => s.personId === 1).map((s) => [s.date, s.prs]));
  assert.deepEqual(byDate.get('2026-09-03'), ['bench_press']); // beats 50 even though 70 was logged first
});

// ---------- per body weight ----------

test('bodyWeightOn uses the latest reading on or before the day, else the first reading', () => {
  const bw = [
    { person_id: 1, date: '2026-09-05', weight_kg: 80 },
    { person_id: 1, date: '2026-09-10', weight_kg: 82 },
    { person_id: 2, date: '2026-09-01', weight_kg: 60 },
  ];
  assert.equal(bodyWeightOn(bw, 1, '2026-09-01'), 80); // before any reading: the first one
  assert.equal(bodyWeightOn(bw, 1, '2026-09-05'), 80);
  assert.equal(bodyWeightOn(bw, 1, '2026-09-09'), 80);
  assert.equal(bodyWeightOn(bw, 1, '2026-09-20'), 82);
  assert.equal(bodyWeightOn(bw, 3, '2026-09-20'), null);
});

test('× BW mode: best set weight divided by body weight; people with no body weight are left out', () => {
  const entries = [set(1, '2026-09-01', 1, 100, 8), set(1, '2026-09-01', 2, 90, 5), set(2, '2026-09-01', 1, 60, 5)];
  const bodyWeights = [{ person_id: 1, date: '2026-09-01', weight_kg: 80 }];
  const { rows, personIds } = buildChartData(entries, bench, 'bw', { bodyWeights });
  assert.deepEqual(personIds, [1]);
  assert.equal(rows[0][seriesKey(1)], 1.25); // best set 100 x 8, divided by 80 kg
});

test('assisted sets: less assistance is the better set and the PR', () => {
  const entries = [set(1, '2026-09-01', 1, -30, 8), set(1, '2026-09-03', 1, -20, 8)];
  assert.equal(value(entries, bench, 1, '2026-09-03', 'best'), -20);
  const byDate = new Map(recentSessions(entries, kinds, 5).map((s) => [s.date, s.prs]));
  assert.deepEqual(byDate.get('2026-09-03'), ['bench_press']);
});

// ---------- running ----------

const running = { id: 'running', name: 'Running', kind: 'running' };
const runRow = (person_id, date, set_number, run_type, distance_km, duration_sec) => ({
  id: nextId++, person_id, exercise: 'running', date, set_number, run_type, distance_km, duration_sec,
  weight: null, reps: null, duration_min: null, equipment: null,
});

test('formatDuration and formatPace', () => {
  assert.equal(formatDuration(95), '1:35');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatPace(290), '4:50 /km');
});

test('easy runs chart total distance per day', () => {
  const entries = [runRow(1, '2026-09-01', 1, 'easy', 5, 1800), runRow(1, '2026-09-01', 2, 'easy', 3.2, 1200), runRow(1, '2026-09-01', 3, 'tempo', 5, 1400)];
  const { rows } = runningChartData(entries, 'easy');
  assert.equal(rows[0][seriesKey(1)], 8.2);
  assert.equal(rows[0].detail[seriesKey(1)].length, 2);
});

test('tempo runs chart the best pace, for the chosen distance only', () => {
  const entries = [
    runRow(1, '2026-09-01', 1, 'tempo', 5, 1500), // 300 s/km
    runRow(1, '2026-09-01', 2, 'tempo', 5, 1450), // 290 s/km
    runRow(1, '2026-09-02', 1, 'tempo', 10, 3100), // 10K
  ];
  const fiveK = runningChartData(entries, 'tempo', { tempoDistance: '5k' });
  assert.deepEqual(fiveK.rows.map((r) => r.date), ['2026-09-01']);
  assert.equal(fiveK.rows[0][seriesKey(1)], 290);
  assert.deepEqual(runningChartData(entries, 'tempo', { tempoDistance: '10k' }).rows.map((r) => r.date), ['2026-09-02']);
  assert.equal(runningChartData(entries, 'tempo', { tempoDistance: 'all' }).rows.length, 2);
  assert.equal(matchesTempoDistance(5.2, '5k'), true); // within 5%
  assert.equal(matchesTempoDistance(4.7, '5k'), false);
  assert.equal(matchesTempoDistance(10.4, '10k'), true);
});

test('intervals chart average pace: total time over total distance', () => {
  const entries = [runRow(1, '2026-09-01', 1, 'intervals', 0.5, 90), runRow(1, '2026-09-01', 2, 'intervals', 1, 210)];
  const { rows } = runningChartData(entries, 'intervals');
  assert.equal(rows[0][seriesKey(1)], 200); // 300 s over 1.5 km
});

test('running PRs: longest easy run, fastest tempo pace within the same distance', () => {
  const entries = [
    runRow(1, '2026-09-01', 1, 'tempo', 5, 1500),
    runRow(1, '2026-09-02', 1, 'tempo', 10, 3200), // first 10K: no PR, and not compared with 5K
    runRow(1, '2026-09-03', 1, 'tempo', 5, 1450), // faster 5K: PR
    runRow(1, '2026-09-04', 1, 'easy', 6, 2400),
    runRow(1, '2026-09-05', 1, 'easy', 5, 1800), // shorter: no PR
  ];
  const kindsWithRun = [...kinds, running];
  const prs = new Map(recentSessions(entries, kindsWithRun, 10).map((s) => [s.date, s.prs]));
  assert.deepEqual(prs.get('2026-09-02'), []);
  assert.deepEqual(prs.get('2026-09-03'), ['running']);
  assert.deepEqual(prs.get('2026-09-05'), []);
});

// ---------- chart ranges ----------

test('chartRangeStart: 8 weeks is this week plus the 7 before, from a Monday', () => {
  assert.equal(chartRangeStart('2026-09-25', '8w'), '2026-08-03'); // Fri -> Mon 21 Sep - 7 weeks
  assert.equal(chartRangeStart('2026-09-21', '8w'), '2026-08-03'); // already Monday
  assert.equal(chartRangeStart('2026-09-27', '8w'), '2026-08-03'); // Sunday, same week
  assert.equal(chartRangeStart('2026-09-25', '3m'), '2026-06-26');
  assert.equal(chartRangeStart('2026-09-25', 'all'), null);
});

// ---------- line gaps and shared axes ----------

const day = (date, values) => ({ t: Date.parse(`${date}T00:00:00Z`), date, detail: {}, ...values });

test('splitAtGaps breaks a line after more than 8 weeks without a session, and only then', () => {
  const rows = [
    day('2026-01-05', { p1: 100, p2: 50 }),
    day('2026-03-02', { p1: 105, p2: null }), // 56 days later: exactly 8 weeks, still joined
    day('2026-05-04', { p1: 90, p2: 55 }), // 63 days later for p1: a new line
    day('2026-05-11', { p1: 95, p2: null }),
  ];
  rows[0].detail.p1 = ['sets'];
  const { rows: out, lines } = splitAtGaps(rows, [1, 2]);
  assert.deepEqual(lines, [
    { personId: 1, key: 'p1_0' },
    { personId: 1, key: 'p1_1' },
    { personId: 2, key: 'p2_0' },
    { personId: 2, key: 'p2_1' }, // p2: 5 Jan -> 4 May is 119 days
  ]);
  assert.deepEqual(out.map((r) => [r.p1_0, r.p1_1]), [[100, undefined], [105, undefined], [undefined, 90], [undefined, 95]]);
  assert.deepEqual(out[0].detail.p1_0, ['sets']); // hover detail follows the segment
  assert.equal(rows[0].p1_0, undefined); // the input is not changed
});

test('evenTicks: the same evenly spaced dates for every chart sharing a range', () => {
  const ticks = evenTicks('2026-08-03', '2026-09-26', 4);
  assert.equal(ticks.length, 4);
  assert.equal(new Date(ticks[0]).toISOString().slice(0, 10), '2026-08-03');
  assert.equal(new Date(ticks[3]).toISOString().slice(0, 10), '2026-09-26');
  assert.deepEqual(evenTicks('2026-09-26', '2026-09-26', 4), [Date.parse('2026-09-26T00:00:00Z')]);
});
