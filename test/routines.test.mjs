import test from 'node:test';
import assert from 'node:assert/strict';
import { routineName, similarity, suggestRoutines } from '../src/lib/routines.js';

const exercises = [
  { id: 'bench_press', kind: 'strength', muscle_group: 'chest' },
  { id: 'chest_fly', kind: 'strength', muscle_group: 'chest' },
  { id: 'lateral_raise', kind: 'strength', muscle_group: 'shoulders' },
  { id: 'tricep_pushdown', kind: 'strength', muscle_group: 'triceps' },
  { id: 'lat_pulldown', kind: 'strength', muscle_group: 'back' },
  { id: 'seated_row', kind: 'strength', muscle_group: 'back' },
  { id: 'cable_curl', kind: 'strength', muscle_group: 'biceps' },
  { id: 'squat', kind: 'strength', muscle_group: 'legs' },
  { id: 'leg_extension', kind: 'strength', muscle_group: 'legs' },
  { id: 'pull_ups', kind: 'reps', muscle_group: null },
  { id: 'cardio', kind: 'cardio', muscle_group: null },
];

let id = 1;
const day = (date, ids, person_id = 1) => ids.map((exercise) => ({ id: id++, person_id, exercise, date, set_number: 1 }));
const push = ['bench_press', 'chest_fly', 'lateral_raise', 'tricep_pushdown'];
const pull = ['lat_pulldown', 'seated_row', 'cable_curl'];
const today = '2026-09-30';

test('similarity is shared exercises over all exercises', () => {
  assert.equal(similarity(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(similarity(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
  assert.equal(similarity(new Set(), new Set()), 0);
});

test('routineName: push, pull and leg days, else the groups involved', () => {
  assert.equal(routineName(push, exercises), 'Push day');
  assert.equal(routineName(pull, exercises), 'Pull day');
  assert.equal(routineName(['squat', 'leg_extension'], exercises), 'Leg day');
  // Most exercises first; groups with the same count keep the order they first appear.
  assert.equal(routineName(['lat_pulldown', 'seated_row', 'cable_curl', 'squat'], exercises), 'Back, Biceps & Legs');
  assert.equal(routineName(['pull_ups', 'cardio'], exercises), 'Calisthenics & Cardio');
});

test('suggests repeated combinations, most repeated first, keeping exercises done on half the days or more', () => {
  const entries = [
    ...day('2026-09-01', push),
    ...day('2026-09-08', push),
    ...day('2026-09-15', [...push.slice(0, 3), 'cardio']), // no pushdowns, one-off cardio: still a push day
    ...day('2026-09-02', pull),
    ...day('2026-09-09', pull),
    ...day('2026-09-03', ['squat']), // one exercise: not a routine
    ...day('2026-09-10', ['squat']),
  ];
  const s = suggestRoutines(entries, exercises, 1, today);
  assert.deepEqual(s.map((x) => [x.name, x.days, x.lastDate]), [['Push day', 3, '2026-09-15'], ['Pull day', 2, '2026-09-09']]);
  assert.deepEqual(s[0].exerciseIds, push); // cardio was on 1 of 3 days, so left out
});

test('a combination done only once, someone else\'s days, or old days are not suggested', () => {
  const entries = [
    ...day('2026-09-01', push),
    ...day('2026-09-08', push, 2), // someone else
    ...day('2026-05-01', push), // older than 12 weeks
  ];
  assert.deepEqual(suggestRoutines(entries, exercises, 1, today), []);
});

test('no suggestion once you have a routine with nearly the same exercises; names stay unique', () => {
  const entries = [...day('2026-09-01', push), ...day('2026-09-08', push)];
  assert.deepEqual(suggestRoutines(entries, exercises, 1, today, [{ name: 'Mine', exercise_ids: push }]), []);
  const [s] = suggestRoutines(entries, exercises, 1, today, [{ name: 'Push day', exercise_ids: ['squat', 'leg_extension'] }]);
  assert.equal(s.name, 'Push day 2');
});
