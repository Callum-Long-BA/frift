import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, planCells, readTab, sheetDate, sheetSet, tabCsvUrl, warningMessage } from '../api/_sheets.js';

const kenneth = SHEETS.find((s) => s.key === 'kenneth');
const kyle = SHEETS.find((s) => s.key === 'kyle');

test('sheetSet reads both styles, skips blanks and X, and rejects anything else', () => {
  assert.deepEqual(sheetSet('13.25 x 12'), { weight: 13.25, reps: 12 });
  assert.deepEqual(sheetSet('16x16'), { weight: 16, reps: 16 });
  assert.deepEqual(sheetSet('15kg x 13'), { weight: 15, reps: 13 });
  assert.deepEqual(sheetSet('12.5kg x9'), { weight: 12.5, reps: 9 });
  for (const t of ['', '  ', 'X', 'x']) assert.equal(sheetSet(t), 'skip');
  for (const t of ['Squat', '(32kg x 16)', '60']) assert.equal(sheetSet(t), null);
});

test('sheetDate reads day-first dates', () => {
  assert.equal(sheetDate('03/9/2026'), '2026-09-03');
  assert.equal(sheetDate('24/09/2026'), '2026-09-24');
  assert.equal(sheetDate('Week 10'), null);
});

test('tabCsvUrl uses the tab name or the gid', () => {
  assert.match(tabCsvUrl('abc', { sheet: '2026 Gym Progression - 2' }), /gviz\/tq\?tqx=out:csv&sheet=2026%20Gym%20Progression%20-%202$/);
  assert.match(tabCsvUrl('abc', { gid: '0' }), /\/d\/abc\/export\?format=csv&gid=0$/);
});

// Kenneth: "Day N" row, names in the row below, then "Week N" rows. Week 10 = w/c 21 Sep.
const kennethCsv = [
  '"","Day 1","","","","","","Day 2","","",""',
  '"","Tricep push down","","","Lat raises","","","Lat pulldowns","","",""',
  '"Week 10","26x5","26x4","26x3","9x9","X","","54x9","54x7","54x5",""',
  '"Week 11","27x5","","","Mystery move","","","","","",""',
].join('\n');

test('readTab (Kenneth): every non-blank set cell, keyed by tab, row and column, with its sheet date', () => {
  const { cells } = readTab(kennethCsv, kenneth, 1);
  assert.deepEqual(
    cells.map((c) => [c.key, c.name, c.date, c.text]),
    [
      ['1:3:1', 'Tricep push down', '2026-09-21', '26x5'],
      ['1:3:2', 'Tricep push down', '2026-09-21', '26x4'],
      ['1:3:3', 'Tricep push down', '2026-09-21', '26x3'],
      ['1:3:4', 'Lat raises', '2026-09-21', '9x9'],
      ['1:3:7', 'Lat pulldowns', '2026-09-22', '54x9'],
      ['1:3:8', 'Lat pulldowns', '2026-09-22', '54x7'],
      ['1:3:9', 'Lat pulldowns', '2026-09-22', '54x5'],
      ['1:4:1', 'Tricep push down', '2026-09-28', '27x5'],
      ['1:4:4', 'Lat raises', '2026-09-28', 'Mystery move'],
    ],
  );
  assert.equal(cells.at(-1).set, null);
});

// Kyle: from row 9, names beside each Day cell, the Day cell below holds a date, and a
// Weight column of date / "96.6kg" pairs.
const kyleCsv = [
  ',,,,,,,,,,,,',
  ',Day 1,Dumbbell Bench Press,,,,,,,,,Weight ,',
  ',03/07/2026,15kg x 13,15kg x 13,15kg x 7,,,,,,,15/06/2026,103kg',
  ...Array(5).fill(',,,,,,,,,,,,'),
  ',Day 1,Dumbbell Bench Press,,,,Day 4,Squat,,,,15/09/2026,96.6kg',
  ',21/09/2026,30kg x 8,30kg x 7,30kg x 6,,25/09/2026,150kg x 4,,150kg x 4,,24/09/2026,95.1kg',
].join('\n');

test('readTab (Kyle): rows before 9 are ignored; Weight column cells are body weights', () => {
  const { cells, bodyWeights } = readTab(kyleCsv, kyle);
  assert.deepEqual(cells.map((c) => [c.key, c.date, c.text]), [
    ['0:10:2', '2026-09-21', '30kg x 8'],
    ['0:10:3', '2026-09-21', '30kg x 7'],
    ['0:10:4', '2026-09-21', '30kg x 6'],
    ['0:10:7', '2026-09-25', '150kg x 4'],
    ['0:10:9', '2026-09-25', '150kg x 4'],
  ]);
  assert.deepEqual(bodyWeights.map((b) => [b.key, b.date, b.kg]), [['0:9:weight', '2026-09-15', 96.6], ['0:10:weight', '2026-09-24', 95.1]]);
});

const allExercises = new Set(Object.values(kenneth.map).map(([id]) => id));
const plan = (overrides) =>
  planCells({ cells: readTab(kennethCsv, kenneth).cells, seen: new Map(), config: kenneth, today: '2026-09-28', seeding: false, exerciseIds: allExercises, ...overrides });

test('planCells: cells not seen before become new sets (dated by the sync, not the sheet), in sheet order', () => {
  const p = plan({});
  assert.deepEqual(p.newSets.map((s) => [s.exercise, s.weight, s.reps]), [
    ['tricep_pushdown', 26, 5], ['tricep_pushdown', 26, 4], ['tricep_pushdown', 26, 3],
    ['lateral_raise', 9, 9],
    ['lat_pulldown', 54, 9], ['lat_pulldown', 54, 7], ['lat_pulldown', 54, 5],
    ['tricep_pushdown', 27, 5],
  ]);
  assert.equal(p.problems.length, 1);
  assert.match(p.problems[0].message, /"Mystery move" is not weight x reps/);
  assert.ok(p.newSets.every((s) => !('date' in s)));
});

test('planCells: the first run records the backlog and any day already in FRIFT, and imports the rest', () => {
  const p = plan({ seeding: true, loggedDays: new Set() });
  assert.deepEqual(p.newSets.map((s) => s.key), ['0:4:1']); // Week 11 Monday: not backlog, not in FRIFT yet
  assert.equal(p.remember.length, 7); // the seven Week 10 cells (21 and 22 Sep: the backlog)
  assert.equal(p.problems.length, 1); // the unreadable Week 11 cell is reported, not recorded

  const already = plan({ seeding: true, loggedDays: new Set(['2026-09-28|tricep_pushdown']) });
  assert.deepEqual(already.newSets, []); // the old sync (or the app) already has that day
});

test('planCells: unchanged cells do nothing; edited cells update the set they made', () => {
  const seen = new Map([
    ['0:3:1', { value: '26x5', entry_id: 11 }],
    ['0:3:2', { value: '26x4', entry_id: 12 }],
  ]);
  const cells = readTab(kennethCsv.replace('"26x4"', '"28x4"'), kenneth).cells.slice(0, 2);
  const p = plan({ cells, seen });
  assert.deepEqual(p.newSets, []);
  assert.deepEqual(p.updates, [{ key: '0:3:2', entryId: 12, weight: 28, reps: 4, value: '28x4' }]);
});

test('planCells: an edited cell whose set is gone is just recorded; one edited to rubbish is reported', () => {
  const cells = readTab(kennethCsv, kenneth).cells.slice(0, 2);
  const seen = new Map([
    ['0:3:1', { value: '25x5', entry_id: null }],
    ['0:3:2', { value: '26x4', entry_id: 12 }],
  ]);
  const p = plan({ cells: [cells[0], { ...cells[1], text: 'oops', set: null }], seen });
  assert.deepEqual(p.remember, [{ key: '0:3:1', value: '26x5' }]);
  assert.equal(p.updates.length, 0);
  assert.equal(p.problems.length, 1);
});

test('planCells: unmapped names and missing exercises are reported and retried later', () => {
  const cells = [
    { key: '0:5:1', line: 5, name: 'Pec deck', date: '2026-09-28', text: '40x10', set: { weight: 40, reps: 10 } },
    { key: '0:5:4', line: 5, name: 'Lat raises', date: '2026-09-28', text: '9x9', set: { weight: 9, reps: 9 } },
  ];
  const p = plan({ cells, exerciseIds: new Set() });
  assert.deepEqual(p.unmapped, ['Pec deck']);
  assert.deepEqual(p.problems, [{ name: 'lateral_raise', message: 'is not an exercise in FRIFT' }]);
  assert.deepEqual(p.remember, []); // not recorded, so the next run tries again
});

test('planCells: body weights are new, updated or recorded like set cells', () => {
  const { bodyWeights } = readTab(kyleCsv, kyle);
  const base = { cells: [], bodyWeights, config: kyle, today: '2026-09-28', exerciseIds: allExercises };
  const first = planCells({ ...base, seen: new Map(), seeding: true, bwDates: new Set(['2026-09-24']) });
  assert.deepEqual(first.newBodyWeights, []); // 15 Sep is backlog; 24 Sep already has a reading
  assert.equal(first.remember.length, 2);
  const missed = planCells({ ...base, seen: new Map(), seeding: true, bwDates: new Set() });
  assert.deepEqual(missed.newBodyWeights.map((b) => b.kg), [95.1]); // 24 Sep was never synced

  const later = planCells({ ...base, seeding: false, seen: new Map([['0:9:weight', { value: '96.6kg', bw_date: '2026-09-15' }], ['0:10:weight', { value: '95kg', bw_date: '2026-09-24' }]]) });
  assert.deepEqual(later.bwUpdates, [{ key: '0:10:weight', date: '2026-09-24', kg: 95.1, value: '95.1kg' }]);

  const fresh = planCells({ ...base, seeding: false, seen: new Map() });
  assert.deepEqual(fresh.newBodyWeights.map((b) => b.kg), [96.6, 95.1]);
});

test('warningMessage: one line for Discord, or nothing when all went well', () => {
  assert.equal(warningMessage('Kyle', { unmapped: [], problems: [] }), null);
  assert.equal(
    warningMessage('Kyle', { unmapped: ['Pec deck'], problems: [{ name: 'deadlift', message: 'is not an exercise in FRIFT' }] }),
    '⚠️ FRIFT sheet sync for Kyle: not sure which FRIFT exercise "Pec deck" is, so it was skipped. skipped deadlift is not an exercise in FRIFT.',
  );
  assert.match(warningMessage('Kenneth', { failure: 'could not read the sheet: Google Sheets returned 500' }), /^⚠️ FRIFT sheet sync for Kenneth: could not read the sheet/);
});

test('every mapped exercise name is lower case, so lookups match', () => {
  for (const sheet of SHEETS) for (const name of Object.keys(sheet.map)) assert.equal(name, name.toLowerCase());
});

test('warningMessage: cells typed in the wrong format ("Do 35") are not posted to Discord', () => {
  const formatOnly = [{ line: 12, name: 'Squat', message: '"Do 35" is not weight x reps', format: true }];
  assert.equal(warningMessage('Kyle', { unmapped: [], problems: formatOnly }), null);
  const p = plan({ cells: [{ key: '0:9:1', line: 9, name: 'Lat raises', date: '2026-09-28', text: 'Do 35', set: null }] });
  assert.equal(p.problems.length, 1); // still in the sync's result
  assert.equal(p.problems[0].format, true);
});
