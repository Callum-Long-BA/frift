import { db } from './_db.js';
import { route, isCron, HttpError } from './_http.js';
import { buildDailyMessages, londonNow } from './_discord.js';
import { parseDate } from './_validate.js';

// Posts today's entries to Discord at 8pm UK time: one message per person who logged
// anything, sent to the channel webhook in DISCORD_WEBHOOK_URL.
//
// Vercel Cron schedules are in UTC, so vercel.json calls this at both 19:00 and 20:00 UTC
// and only the call that lands in the 8pm hour in London goes ahead. That keeps it at 8pm
// through summer and winter time. Each day is recorded in discord_posts, so a repeated
// call from Vercel cannot post the same day twice.
//
// Run by hand with the passcode (GET /api/daily-discord, optionally ?date=2026-09-22) it
// posts straight away, whatever the time, and does not stop the 8pm post.

const POST_HOUR = 20;
const PAUSE_MS = 500; // Discord allows about 5 webhook messages every 2 seconds

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postToDiscord(url, payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(502, 'Could not reach Discord.');
    }
    if (res.ok) return;
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000));
      continue;
    }
    throw new HttpError(502, `Discord refused the message (${res.status}). Check DISCORD_WEBHOOK_URL.`);
  }
  throw new HttpError(502, 'Discord kept asking FRIFT to slow down. Try again in a minute.');
}

export default route(
  {
    async GET(req) {
      const url = process.env.DISCORD_WEBHOOK_URL;
      if (!url) throw new HttpError(500, 'DISCORD_WEBHOOK_URL is not set on the server.');

      const now = londonNow();
      const scheduled = isCron(req);
      if (scheduled && now.hour !== POST_HOUR) {
        return { skipped: `It is ${now.hour}:00 in London, not ${POST_HOUR}:00.` };
      }
      const date = !scheduled && req.query?.date ? parseDate(req.query.date) : now.date;

      const sql = db();
      const [people, exercises, entries] = await Promise.all([
        sql`select id, name from people`,
        sql`select id, name, kind from exercises`,
        sql`select id, person_id, exercise, to_char(entry_date, 'YYYY-MM-DD') as date, set_number,
                   weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment
            from entries where entry_date <= ${date}::date`,
      ]);

      const messages = buildDailyMessages({ people, exercises, entries, date });
      if (messages.length === 0) return { date, posted: 0 };

      if (scheduled) {
        const claimed = await sql`insert into discord_posts (day) values (${date}::date) on conflict do nothing returning day`;
        if (claimed.length === 0) return { date, skipped: 'Already posted today.' };
      }

      let posted = 0;
      try {
        for (const { payload } of messages) {
          if (posted > 0) await sleep(PAUSE_MS);
          await postToDiscord(url, payload);
          posted++;
        }
      } catch (err) {
        // If nothing went out, release the day so a later run can try again. If some
        // messages did go out, keep it, so no one gets their message twice.
        if (scheduled && posted === 0) await sql`delete from discord_posts where day = ${date}::date`;
        throw err;
      }

      console.log('Discord post', JSON.stringify({ date, posted }));
      return { date, posted };
    },
  },
  { allowCron: true },
);
