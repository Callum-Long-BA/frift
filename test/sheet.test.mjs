import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseDate, parseCsv, readSheet } from '../api/_sheet.js';
import { route } from '../api/_http.js';

test('parseCsv handles quotes, escaped quotes, commas in fields and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"'],
  ]);
  assert.deepEqual(parseCsv('a,b\n1,'), [['a', 'b'], ['1', '']]);
});

test('normaliseDate reads ISO and UK day-first dates, with or without a time', () => {
  assert.equal(normaliseDate('2026-09-22'), '2026-09-22');
  assert.equal(normaliseDate('22/09/2026'), '2026-09-22');
  assert.equal(normaliseDate('2/9/26'), '2026-09-02');
  assert.equal(normaliseDate('22/09/2026 18:03:11'), '2026-09-22');
  assert.equal(normaliseDate('Sept 22'), null);
  assert.equal(normaliseDate(''), null);
});

const csv = [
  'Date,Name,Exercise,Weight,Reps,Minutes,Equipment,Notes',
  '22/09/2026,Sam,Bench press,60,8,,Dumbbell,felt good',
  '22/09/2026,Sam,Bench press,60,8,,Dumbbell,',
  '22/09/2026,Jo,Cardio,,,30,,',
  ',,,,,,,',
  'yesterday,Jo,Squat,80,5,,,',
].join('\n');

test('readSheet maps headers, skips blank rows and reports unreadable dates by row number', () => {
  const { rows, errors } = readSheet(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    { ...rows[0], fingerprint: undefined },
    { line: 2, date: '2026-09-22', name: 'Sam', exercise: 'Bench press', weight: '60', reps: '8', minutes: '', equipment: 'dumbbell', fingerprint: undefined },
  );
  assert.equal(rows[2].minutes, '30');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Row 6: /);
});

test('identical rows get distinct fingerprints, and the same sheet gives the same fingerprints', () => {
  const a = readSheet(csv).rows.map((r) => r.fingerprint);
  assert.notEqual(a[0], a[1]);
  assert.deepEqual(readSheet(csv).rows.map((r) => r.fingerprint), a);
});

test('fingerprints survive new rows being inserted above, and ignore extra columns', () => {
  const before = readSheet(csv).rows.map((r) => r.fingerprint);
  const lines = csv.split('\n');
  lines.splice(1, 0, '21/09/2026,Jo,Squat,80,5,,,new row');
  const after = readSheet(lines.join('\n')).rows.map((r) => r.fingerprint);
  for (const f of before) assert.ok(after.includes(f));
});

test('a Google Form timestamp column stands in for a missing date column', () => {
  const { rows } = readSheet('Timestamp,Name,Exercise,Reps\n22/09/2026 07:15:00,Sam,Pull ups,12');
  assert.equal(rows[0].date, '2026-09-22');
});

test('readSheet refuses a sheet without the required headers', () => {
  const { rows, errors } = readSheet('When,Who\n22/09/2026,Sam');
  assert.equal(rows.length, 0);
  assert.match(errors[0], /missing: date, exercise/);
});

function fakeRes() {
  return {
    code: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('allowCron lets in the cron secret; other routes and wrong secrets still need the passcode', async () => {
  process.env.FRIFT_PASSCODE = 'secret-lift';
  process.env.CRON_SECRET = 'cron-123';
  const ok = async () => ({ ok: true });
  const call = async (handler, headers) => {
    const res = fakeRes();
    await handler({ method: 'GET', headers }, res);
    return res.code;
  };

  assert.equal(await call(route({ GET: ok }, { allowCron: true }), { authorization: 'Bearer cron-123' }), 200);
  assert.equal(await call(route({ GET: ok }, { allowCron: true }), { authorization: 'Bearer nope' }), 401);
  assert.equal(await call(route({ GET: ok }, { allowCron: true }), { 'x-frift-passcode': 'secret-lift' }), 200);
  assert.equal(await call(route({ GET: ok }), { authorization: 'Bearer cron-123' }), 401);

  delete process.env.CRON_SECRET;
  assert.equal(await call(route({ GET: ok }, { allowCron: true }), { authorization: 'Bearer undefined' }), 401);
});
