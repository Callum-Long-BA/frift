import { db } from './_db.js';
import { route, isCron, HttpError } from './_http.js';
import { buildDailyMessages, discordLink, londonNow } from './_discord.js';
import { PAUSE_MS, postToDiscord, sleep, webhookInfo } from './_webhook.js';
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
// posts straight away, whatever the time, and does not stop the 8pm post. The result links
// to every message posted, so you can see exactly where they went.
// GET /api/daily-discord?check=1 posts nothing: it only says which server and channel the
// webhook in DISCORD_WEBHOOK_URL posts to.

const POST_HOUR = 20;

export default route(
  {
    async GET(req) {
      const url = process.env.DISCORD_WEBHOOK_URL;
      if (!url) throw new HttpError(500, 'DISCORD_WEBHOOK_URL is not set on the server.');

      const scheduled = isCron(req);
      const now = londonNow();
      if (scheduled && now.hour !== POST_HOUR) {
        return { skipped: `It is ${now.hour}:00 in London, not ${POST_HOUR}:00.` };
      }

      const webhook = await webhookInfo(url);
      if (!scheduled && req.query?.check) return { webhook };
      const date = !scheduled && req.query?.date ? parseDate(req.query.date) : now.date;

      const sql = db();
      const [people, exercises, entries] = await Promise.all([
        sql`select id, name from people`,
        sql`select id, name, kind from exercises`,
        sql`select id, person_id, exercise, to_char(entry_date, 'YYYY-MM-DD') as date, set_number,
                   weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment,
                   run_type, distance_km::float8 as distance_km, duration_sec
            from entries where entry_date <= ${date}::date`,
      ]);

      const messages = buildDailyMessages({ people, exercises, entries, date });
      if (messages.length === 0) return { date, posted: 0, webhook };

      if (scheduled) {
        const claimed = await sql`insert into discord_posts (day) values (${date}::date) on conflict do nothing returning day`;
        if (claimed.length === 0) return { date, skipped: 'Already posted today.' };
      }

      const links = [];
      let posted = 0;
      try {
        for (const { payload } of messages) {
          if (posted > 0) await sleep(PAUSE_MS);
          const message = await postToDiscord(url, payload);
          links.push(discordLink(webhook.guildId, message.channelId, message.id));
          posted++;
        }
      } catch (err) {
        // If nothing went out, release the day so a later run can try again. If some
        // messages did go out, keep it, so no one gets their message twice.
        if (scheduled && posted === 0) await sql`delete from discord_posts where day = ${date}::date`;
        throw err;
      }

      console.log('Discord post', JSON.stringify({ date, posted, channel: webhook.channelLink }));
      return { date, posted, webhook, links };
    },
  },
  { allowCron: true },
);
