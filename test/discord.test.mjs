import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyMessages, discordLink, escapeMarkdown, isWebhookUrl, londonNow } from '../api/_discord.js';
import { route } from '../api/_http.js';

test('londonNow follows UK summer and winter time', () => {
  // 19:30 UTC is 20:30 in London in September (BST) but 19:30 in December (GMT).
  assert.deepEqual(londonNow(new Date('2026-09-22T19:30:00Z')), { date: '2026-09-22', hour: 20 });
  assert.deepEqual(londonNow(new Date('2026-12-01T19:30:00Z')), { date: '2026-12-01', hour: 19 });
  assert.deepEqual(londonNow(new Date('2026-12-01T20:10:00Z')), { date: '2026-12-01', hour: 20 });
  // Just after midnight in London is still the previous day in UTC.
  assert.deepEqual(londonNow(new Date('2026-09-22T23:30:00Z')), { date: '2026-09-23', hour: 0 });
});

test('escapeMarkdown stops names being read as formatting', () => {
  assert.equal(escapeMarkdown('Sam_the*man'), 'Sam\\_the\\*man');
  assert.equal(escapeMarkdown('Bench press'), 'Bench press');
});

const people = [
  { id: 2, name: 'Jo', colour: '#1F5FBF' },
  { id: 1, name: 'Sam', colour: '#E5322D' },
  { id: 3, name: 'Alex', colour: '#1E9E5A' },
];
const exercises = [
  { id: 'bench_press', name: 'Bench press', kind: 'strength' },
  { id: 'pull_ups', name: 'Pull ups', kind: 'reps' },
  { id: 'cardio', name: 'Cardio', kind: 'cardio' },
];
let nextId = 1;
const row = (person_id, date, exercise, set_number, fields) => ({
  id: nextId++, person_id, date, exercise, set_number, weight: null, reps: null, duration_min: null, equipment: null, ...fields,
});
const today = '2026-09-22';
const entries = [
  row(1, '2026-09-15', 'bench_press', 1, { weight: 60, reps: 8 }),
  row(1, today, 'bench_press', 2, { weight: 62.5, reps: 6 }),
  row(1, today, 'bench_press', 1, { weight: 60, reps: 8 }),
  row(1, today, 'pull_ups', 1, { reps: 12 }),
  row(2, today, 'cardio', 1, { duration_min: 30 }),
  row(3, '2026-09-21', 'cardio', 1, { duration_min: 20 }), // not today: no message
];

test('one message per person who logged today, in the order people joined', () => {
  const messages = buildDailyMessages({ people, exercises, entries, date: today });
  assert.deepEqual(messages.map((m) => m.personId), [1, 2]);
});

test('one line: exercises in the order logged; a PR exercise lists its sets with the record set marked', () => {
  const [sam, jo] = buildDailyMessages({ people, exercises, entries, date: today });
  assert.equal(sam.payload.content, 'Sam worked out today ✅ -> Bench press [PR! 60kg x 8, 62.5kg x 6 🏆], Pull ups.');
  assert.equal(jo.payload.content, 'Jo worked out today ✅ -> Cardio.');
});

test('only the first set to reach the record gets the trophy, as in "34kg x 10, 40kg x 10 🏆, 40kg x 10"', () => {
  const shoulder = { id: 'shoulder_press', name: 'Shoulder press', kind: 'strength' };
  const rows = [
    row(1, '2026-09-15', 'shoulder_press', 1, { weight: 35, reps: 10 }),
    row(1, today, 'shoulder_press', 1, { weight: 34, reps: 10 }),
    row(1, today, 'shoulder_press', 2, { weight: 40, reps: 10 }),
    row(1, today, 'shoulder_press', 3, { weight: 40, reps: 10 }),
  ];
  const [sam] = buildDailyMessages({ people, exercises: [...exercises, shoulder], entries: rows, date: today });
  assert.equal(sam.payload.content, 'Sam worked out today ✅ -> Shoulder press [PR! 34kg x 10, 40kg x 10 🏆, 40kg x 10].');
});

test('reps-only and cardio PRs show reps and minutes; dumbbell sets are marked DB', () => {
  const rows = [
    row(1, '2026-09-15', 'pull_ups', 1, { reps: 10 }),
    row(1, today, 'pull_ups', 1, { reps: 12 }),
    row(1, today, 'pull_ups', 2, { reps: 9 }),
    row(1, '2026-09-15', 'cardio', 1, { duration_min: 20 }),
    row(1, today, 'cardio', 1, { duration_min: 45 }),
    row(1, '2026-09-15', 'bench_press', 1, { weight: 20, reps: 10, equipment: 'dumbbell' }),
    row(1, today, 'bench_press', 1, { weight: 25, reps: 10, equipment: 'dumbbell' }),
  ];
  const [sam] = buildDailyMessages({ people, exercises, entries: rows, date: today });
  assert.equal(
    sam.payload.content,
    'Sam worked out today ✅ -> Pull ups [PR! 12 reps 🏆, 9 reps], Cardio [PR! 45 min 🏆], Bench press [PR! 25kg x 10 DB 🏆].',
  );
});

test('messages never ping anyone, and names cannot add formatting', () => {
  const [sam] = buildDailyMessages({ people: [{ id: 1, name: '*Sam*', colour: '#E5322D' }], exercises, entries, date: today });
  assert.deepEqual(sam.payload.allowed_mentions, { parse: [] });
  assert.match(sam.payload.content, /^\\\*Sam\\\* worked out today/);
});

test('no one logged anything: no messages', () => {
  assert.deepEqual(buildDailyMessages({ people, exercises, entries, date: '2026-09-23' }), []);
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
});

test('isWebhookUrl accepts webhook URLs and rejects channel links and anything else', () => {
  assert.equal(isWebhookUrl('https://discord.com/api/webhooks/123456/abc-DEF_789'), true);
  assert.equal(isWebhookUrl(' https://discordapp.com/api/v10/webhooks/123456/abc?thread_id=9 '), true);
  assert.equal(isWebhookUrl('https://discord.com/channels/111/222'), false);
  assert.equal(isWebhookUrl('https://discord.com/api/webhooks/123456'), false);
  assert.equal(isWebhookUrl('https://evil.example/api/webhooks/1/abc'), false);
  assert.equal(isWebhookUrl(''), false);
});

test('discordLink opens a channel or one message', () => {
  assert.equal(discordLink('111', '222'), 'https://discord.com/channels/111/222');
  assert.equal(discordLink('111', '222', '333'), 'https://discord.com/channels/111/222/333');
});
