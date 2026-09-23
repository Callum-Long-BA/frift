import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, START_DATE, planSync, readTab, sheetDate, sheetSessions, sheetSet, tabCsvUrl, warningMessage } from '../api/_sheets.js';

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

test('Kenneth: week numbers become dates, Day 1 = Monday and Day 2 = Tuesday', () => {
  const { sets, problems } = readTab(kennethCsv, { ...kenneth, dates: kenneth.dates });
  const byDate = (d) => sets.filter((s) => s.date === d).map((s) => `${s.name} ${s.weight}x${s.reps}`);
  assert.deepEqual(byDate('2026-09-21'), ['Tricep push down 26x5', 'Tricep push down 26x4', 'Tricep push down 26x3', 'Lat raises 9x9']);
  assert.deepEqual(byDate('2026-09-22'), ['Lat pulldowns 54x9', 'Lat pulldowns 54x7', 'Lat pulldowns 54x5']);
  assert.deepEqual(byDate('2026-09-28'), ['Tricep push down 27x5']);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].date, '2026-09-28');
  assert.match(problems[0].message, /not weight x reps/);
});

test('only dates from the start date up to today are synced, and unknown names are listed', () => {
  const { sets } = readTab(kennethCsv, kenneth);
  const { sessions, unmapped } = sheetSessions(
    [...sets, { date: '2026-09-29', name: 'Pec deck', weight: 40, reps: 10 }],
    kenneth,
    '2026-09-29',
  );
  assert.ok(START_DATE > '2026-09-22');
  assert.deepEqual([...sessions.keys()], ['2026-09-28|tricep_pushdown']);
  assert.deepEqual(sessions.get('2026-09-28|tricep_pushdown'), { date: '2026-09-28', exercise: 'tricep_pushdown', equipment: null, sets: [{ weight: 27, reps: 5 }] });
  assert.deepEqual(unmapped, ['Pec deck']);
});

// Kyle: from row 9, names beside each Day cell, and the Day cell below holds the date.
const kyleCsv = [
  ',,,,,,,,,,,,',
  ',Day 1,Dumbbell Bench Press,,,,,,,,,Weight ,',
  ',03/07/2026,15kg x 13,15kg x 13,15kg x 7,,,,,,,15/06/2026,103kg',
  ...Array(5).fill(',,,,,,,,,,,,'),
  ',Day 1,Dumbbell Bench Press,,,,Day 4,Squat,,,,15/09/2026,96.6kg',
  ',21/09/2026,30kg x 8,30kg x 7,30kg x 6,,25/09/2026,150kg x 4,,150kg x 4,,24/09/2026,95.1kg',
].join('\n');

test('Kyle: rows before 9 are ignored; each Day has its own date; the Weight column is body weight', () => {
  const { sets, bodyWeights } = readTab(kyleCsv, kyle);
  assert.deepEqual(
    sets.map((s) => `${s.date} ${s.name} ${s.weight}x${s.reps}`),
    ['2026-09-21 Dumbbell Bench Press 30x8', '2026-09-21 Dumbbell Bench Press 30x7', '2026-09-21 Dumbbell Bench Press 30x6', '2026-09-25 Squat 150x4', '2026-09-25 Squat 150x4'],
  );
  assert.deepEqual(bodyWeights.map((b) => [b.date, b.kg]), [['2026-09-15', 96.6], ['2026-09-24', 95.1]]);
  const { sessions } = sheetSessions(sets, kyle, '2026-09-25');
  assert.deepEqual([...sessions.values()], [{ date: '2026-09-25', exercise: 'squat', equipment: 'barbell', sets: [{ weight: 150, reps: 4 }, { weight: 150, reps: 4 }] }]);
});

const session = (date, exercise, sets, equipment = null) => ({ date, exercise, equipment, sets });
const row = (date, exercise, set_number, weight, reps, source = 'sheet', equipment = null) => ({ date, exercise, set_number, weight, reps, equipment, source });

test('planSync: add new days, replace changed sheet days, leave matching ones and anything from the app', () => {
  const sessions = new Map([
    ['2026-09-24|squat', session('2026-09-24', 'squat', [{ weight: 100, reps: 5 }])],
    ['2026-09-25|squat', session('2026-09-25', 'squat', [{ weight: 100, reps: 5 }, { weight: 100, reps: 4 }])],
    ['2026-09-26|squat', session('2026-09-26', 'squat', [{ weight: 100, reps: 5 }])],
    ['2026-09-27|squat', session('2026-09-27', 'squat', [{ weight: 100, reps: 5 }])],
  ]);
  const existing = [
    row('2026-09-25', 'squat', 1, 100, 5), // the sheet has since gained a second set
    row('2026-09-26', 'squat', 1, 100, 5), // identical
    row('2026-09-27', 'squat', 1, 90, 5, null), // logged in the app
  ];
  const plan = planSync(sessions, existing);
  assert.deepEqual(plan.add.map((s) => s.date), ['2026-09-24']);
  assert.deepEqual(plan.replace.map((s) => s.date), ['2026-09-25']);
  assert.deepEqual(plan.unchanged.map((s) => s.date), ['2026-09-26']);
  assert.deepEqual(plan.app.map((s) => s.date), ['2026-09-27']);
});

test('planSync: a changed weight or equipment counts as a change', () => {
  const sessions = new Map([['2026-09-24|bench_press', session('2026-09-24', 'bench_press', [{ weight: 30, reps: 8 }], 'dumbbell')]]);
  assert.equal(planSync(sessions, [row('2026-09-24', 'bench_press', 1, 30, 8, 'sheet', 'dumbbell')]).unchanged.length, 1);
  assert.equal(planSync(sessions, [row('2026-09-24', 'bench_press', 1, 32.5, 8, 'sheet', 'dumbbell')]).replace.length, 1);
  assert.equal(planSync(sessions, [row('2026-09-24', 'bench_press', 1, 30, 8, 'sheet', null)]).replace.length, 1);
});

test('warningMessage: one line for Discord, or nothing when all went well', () => {
  assert.equal(warningMessage('Kyle', { unmapped: [], problems: [] }), null);
  assert.equal(
    warningMessage('Kyle', { unmapped: ['Pec deck'], problems: [{ line: 12, name: 'Squat', message: '"Squat" is not weight x reps' }] }),
    '⚠️ FRIFT sheet sync for Kyle: not sure which FRIFT exercise "Pec deck" is, so it was skipped. skipped row 12 Squat "Squat" is not weight x reps.',
  );
  assert.match(warningMessage('Kenneth', { failure: 'could not read the sheet: Google Sheets returned 500' }), /^⚠️ FRIFT sheet sync for Kenneth: could not read the sheet/);
});

test('every mapped exercise name is lower case, so lookups match', () => {
  for (const sheet of SHEETS) for (const name of Object.keys(sheet.map)) assert.equal(name, name.toLowerCase());
});
