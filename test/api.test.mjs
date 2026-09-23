import test from 'node:test';
import assert from 'node:assert/strict';
import { route, HttpError } from '../api/_http.js';
import { parseBodyWeight, parseDate, parseExerciseName, parseName, parseNewEntry, slugify } from '../api/_validate.js';

process.env.FRIFT_PASSCODE = 'secret-lift';

function fakeRes() {
  return {
    code: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (method, passcode, extra = {}) => ({
  method, headers: passcode === undefined ? {} : { 'x-frift-passcode': passcode }, ...extra,
});

test('rejects missing and wrong passcodes with 401', async () => {
  const handler = route({ GET: async () => ({ ok: true }) });
  for (const pc of [undefined, '', 'nope', 'secret-lift-x']) {
    const res = fakeRes();
    await handler(req('GET', pc), res);
    assert.equal(res.code, 401);
  }
});

test('accepts the right passcode and returns the handler result', async () => {
  const res = fakeRes();
  await route({ GET: async () => [1, 2] })(req('GET', 'secret-lift'), res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, [1, 2]);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('405 for unsupported methods, with Allow header', async () => {
  const res = fakeRes();
  await route({ GET: async () => [] })(req('PUT', 'secret-lift'), res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
});

test('HttpError keeps its status; unknown errors become a generic 500', async () => {
  const a = fakeRes();
  await route({ GET: async () => { throw new HttpError(409, 'taken'); } })(req('GET', 'secret-lift'), a);
  assert.equal(a.code, 409);
  assert.equal(a.body.error, 'taken');

  const b = fakeRes();
  const original = console.error;
  console.error = () => {};
  await route({ GET: async () => { throw new Error('db password is hunter2'); } })(req('GET', 'secret-lift'), b);
  console.error = original;
  assert.equal(b.code, 500);
  assert.ok(!b.body.error.includes('hunter2'));
});

const now = new Date('2026-09-19T12:00:00Z');

test('parseDate accepts today and tomorrow, rejects the rest', () => {
  assert.equal(parseDate('2026-09-19', now), '2026-09-19');
  assert.equal(parseDate('2026-09-20', now), '2026-09-20');
  assert.throws(() => parseDate('2026-09-21', now), HttpError);
  assert.throws(() => parseDate('2026-02-30', now), HttpError);
  assert.throws(() => parseDate('19/09/2026', now), HttpError);
  assert.throws(() => parseDate('2019-12-31', now), HttpError);
});

test('parseName trims, collapses spaces, and enforces length', () => {
  assert.equal(parseName('  Sam   Jones '), 'Sam Jones');
  assert.throws(() => parseName('   '), HttpError);
  assert.throws(() => parseName('x'.repeat(25)), HttpError);
});

const exercises = [
  { id: 'bench_press', kind: 'strength', equipment_choice: false },
  { id: 'squat', kind: 'strength', equipment_choice: true },
  { id: 'romanian_deadlift', kind: 'strength', equipment_choice: false },
  { id: 'cardio', kind: 'cardio', equipment_choice: false },
  { id: 'pull_ups', kind: 'reps', equipment_choice: false },
  { id: 'running', kind: 'running', equipment_choice: false },
];
const base = { personId: 1, exercise: 'bench_press', date: '2026-09-19' };

test('parseNewEntry accepts valid strength sets', () => {
  const e = parseNewEntry({ ...base, sets: [{ weight: '60', reps: 8 }, { weight: 62.5, reps: '6' }] }, exercises, now);
  assert.equal(e.kind, 'strength');
  assert.deepEqual(e.sets, [{ weight: 60, reps: 8 }, { weight: 62.5, reps: 6 }]);
});

test('parseNewEntry rejects blanks, fractions, negatives and bad shapes', () => {
  const bad = [
    { ...base, sets: [{ weight: '', reps: 8 }] },
    { ...base, sets: [{ weight: 60, reps: '' }] },
    { ...base, sets: [{ weight: 60, reps: 7.5 }] },
    { ...base, sets: [{ weight: -501, reps: 8 }] },
    { ...base, sets: [] },
    { ...base, sets: Array.from({ length: 11 }, () => ({ weight: 60, reps: 8 })) },
    { ...base, exercise: 'deadlift', sets: [{ weight: 60, reps: 8 }] },
    { ...base, personId: 'abc', sets: [{ weight: 60, reps: 8 }] },
  ];
  for (const body of bad) assert.throws(() => parseNewEntry(body, exercises, now), HttpError);
});

test('parseNewEntry handles cardio minutes', () => {
  const e = parseNewEntry({ personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin: '30' }, exercises, now);
  assert.deepEqual(e, { kind: 'cardio', personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin: 30 });
  for (const durationMin of ['', 0, -3, 601, 'abc']) {
    assert.throws(() => parseNewEntry({ personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin }, exercises, now), HttpError);
  }
});

test('parseNewEntry accepts a user-added exercise once it is in the database list', () => {
  const body = { personId: 1, exercise: 'romanian_deadlift', date: '2026-09-19', sets: [{ weight: 80, reps: 8 }] };
  assert.equal(parseNewEntry(body, exercises, now).exercise, 'romanian_deadlift');
  assert.throws(() => parseNewEntry(body, exercises.slice(0, 1), now), HttpError);
});

test('parseExerciseName trims, collapses spaces, and enforces length', () => {
  assert.equal(parseExerciseName('  Romanian   deadlift '), 'Romanian deadlift');
  assert.throws(() => parseExerciseName('   '), HttpError);
  assert.throws(() => parseExerciseName('x'.repeat(31)), HttpError);
  assert.equal(parseExerciseName('x'.repeat(30)).length, 30);
});

test('slugify makes safe ids and refuses names with no letters or numbers', () => {
  assert.equal(slugify('Incline Bench Press!'), 'incline_bench_press');
  assert.equal(slugify('  Face   pulls '), 'face_pulls');
  assert.equal(slugify('Écarté'), 'ecarte');
  assert.equal(slugify("Farmer's walk (heavy)"), 'farmer_s_walk_heavy');
  assert.throws(() => slugify('🏋️'), HttpError);
  assert.throws(() => slugify('---'), HttpError);
});

test('names that differ only by punctuation collide on the same slug', () => {
  assert.equal(slugify('Bench-press'), slugify('Bench press'));
});

const squat = { personId: 1, exercise: 'squat', date: '2026-09-19' };
const oneSet = [{ weight: 30, reps: 10 }];

test('exercises with a barbell/dumbbell choice require it, and keep it', () => {
  assert.equal(parseNewEntry({ ...squat, equipment: 'dumbbell', sets: oneSet }, exercises, now).equipment, 'dumbbell');
  assert.equal(parseNewEntry({ ...squat, equipment: 'barbell', sets: oneSet }, exercises, now).equipment, 'barbell');
  assert.throws(() => parseNewEntry({ ...squat, sets: oneSet }, exercises, now), /Choose barbell or dumbbell/);
  assert.throws(() => parseNewEntry({ ...squat, equipment: 'kettlebell', sets: oneSet }, exercises, now), HttpError);
  assert.throws(() => parseNewEntry({ ...squat, equipment: '', sets: oneSet }, exercises, now), HttpError);
});

test('exercises without the choice ignore any equipment sent and store none', () => {
  const e = parseNewEntry({ ...base, equipment: 'dumbbell', sets: oneSet }, exercises, now);
  assert.equal(e.equipment, null);
});

test('cardio never carries equipment', () => {
  const e = parseNewEntry({ personId: 1, exercise: 'cardio', date: '2026-09-19', durationMin: 20, equipment: 'dumbbell' }, exercises, now);
  assert.equal(e.equipment, undefined);
});

const pullups = { personId: 1, exercise: 'pull_ups', date: '2026-09-19' };

test('reps-only exercises take reps alone and store no weight or equipment', () => {
  const e = parseNewEntry({ ...pullups, equipment: 'dumbbell', sets: [{ reps: '12' }, { reps: 8, weight: 20 }] }, exercises, now);
  assert.equal(e.kind, 'reps');
  assert.equal(e.equipment, null);
  assert.deepEqual(e.sets, [{ weight: null, reps: 12 }, { weight: null, reps: 8 }]);
});

test('reps-only exercises still reject bad reps', () => {
  for (const r of ['', 0, 7.5, 201, 'abc']) {
    assert.throws(() => parseNewEntry({ ...pullups, sets: [{ reps: r }] }, exercises, now), HttpError);
  }
});

test('assisted sets: negative weights down to -500 kg are accepted', () => {
  const e = parseNewEntry({ ...base, sets: [{ weight: -20, reps: 8 }, { weight: '-500', reps: 5 }] }, exercises, now);
  assert.deepEqual(e.sets, [{ weight: -20, reps: 8 }, { weight: -500, reps: 5 }]);
  assert.throws(() => parseNewEntry({ ...base, sets: [{ weight: -500.5, reps: 8 }] }, exercises, now), HttpError);
});

const run = { personId: 1, exercise: 'running', date: '2026-09-19' };

test('running: easy and tempo take one run; intervals take several', () => {
  const easy = parseNewEntry({ ...run, runType: 'easy', runs: [{ distanceKm: '5.234', seconds: 1800 }] }, exercises, now);
  assert.deepEqual(easy, { kind: 'running', personId: 1, exercise: 'running', date: '2026-09-19', runType: 'easy', runs: [{ distanceKm: 5.23, seconds: 1800 }] });
  const intervals = parseNewEntry({ ...run, runType: 'intervals', runs: [{ distanceKm: 0.4, seconds: 90 }, { distanceKm: 0.4, seconds: 88 }] }, exercises, now);
  assert.equal(intervals.runs.length, 2);
  assert.throws(() => parseNewEntry({ ...run, runType: 'tempo', runs: [{ distanceKm: 5, seconds: 1500 }, { distanceKm: 5, seconds: 1500 }] }, exercises, now), /one run/);
});

test('running: rejects bad run types, distances and times', () => {
  const bad = [
    { ...run, runType: 'sprint', runs: [{ distanceKm: 5, seconds: 1500 }] },
    { ...run, runType: 'easy', runs: [] },
    { ...run, runType: 'easy', runs: [{ distanceKm: 0, seconds: 1500 }] },
    { ...run, runType: 'easy', runs: [{ distanceKm: 201, seconds: 1500 }] },
    { ...run, runType: 'easy', runs: [{ distanceKm: 5, seconds: 0 }] },
    { ...run, runType: 'easy', runs: [{ distanceKm: 5, seconds: 90.5 }] },
    { ...run, runType: 'easy', runs: [{ distanceKm: 5, seconds: '' }] },
  ];
  for (const body of bad) assert.throws(() => parseNewEntry(body, exercises, now), HttpError);
});

test('parseBodyWeight keeps one decimal and checks the range', () => {
  assert.deepEqual(parseBodyWeight({ personId: 1, date: '2026-09-19', weightKg: '80.26' }, now), { personId: 1, date: '2026-09-19', weightKg: 80.3 });
  for (const weightKg of ['', 19.9, 400.1, 'abc']) {
    assert.throws(() => parseBodyWeight({ personId: 1, date: '2026-09-19', weightKg }, now), HttpError);
  }
});
