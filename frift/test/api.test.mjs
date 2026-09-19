import test from 'node:test';
import assert from 'node:assert/strict';
import { route, HttpError } from '../api/_http.js';
import { parseDate, parseName, parseNewEntry } from '../api/_validate.js';

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

const base = { personId: 1, exercise: 'bench_press', date: '2026-09-19' };

test('parseNewEntry accepts valid strength sets', () => {
  const e = parseNewEntry({ ...base, sets: [{ weight: '60', reps: 8 }, { weight: 62.5, reps: '6' }] }, now);
  assert.equal(e.kind, 'strength');
  assert.deepEqual(e.sets, [{ weight: 60, reps: 8 }, { weight: 62.5, reps: 6 }]);
});

test('parseNewEntry rejects blanks, fractions, negatives and bad shapes', () => {
  const bad = [
    { ...base, sets: [{ weight: '', reps: 8 }] },
    { ...base, sets: [{ weight: 60, reps: '' }] },
    { ...base, sets: [{ weight: 60, reps: 7.5 }] },
    { ...base, sets: [{ weight: -5, reps: 8 }] },
    { ...base, sets: [] },
    { ...base, sets: Array.from({ length: 11 }, () => ({ weight: 60, reps: 8 })) },
    { ...base, exercise: 'deadlift', sets: [{ weight: 60, reps: 8 }] },
    { ...base, personId: 'abc', sets: [{ weight: 60, reps: 8 }] },
  ];
  for (const body of bad) assert.throws(() => parseNewEntry(body, now), HttpError);
});

test('parseNewEntry handles cardio minutes', () => {
  const e = parseNewEntry({ personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin: '30' }, now);
  assert.deepEqual(e, { kind: 'cardio', personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin: 30 });
  for (const durationMin of ['', 0, -3, 601, 'abc']) {
    assert.throws(() => parseNewEntry({ personId: 2, exercise: 'cardio', date: '2026-09-19', durationMin }, now), HttpError);
  }
});
