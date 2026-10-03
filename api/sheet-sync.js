import { db } from './_db.js';
import { route, isCron, HttpError } from './_http.js';
import { londonNow } from './_discord.js';
import { postToDiscord } from './_webhook.js';
import { SHEETS, planCells, readTab, tabCsvUrl, warningMessage } from './_sheets.js';

// Copies new sets from people's own Google Sheets into FRIFT at 3:15pm and 6pm UK time (see
// api/_sheets.js for which sheets and how they are read).
//
// Every set cell is tracked in the sheet_cells table. A cell filled in since the last run
// becomes a set dated the day of this sync (not the date written in the sheet), numbered
// after anything already logged for that exercise that day. A cell that has changed since it
// was imported updates the set it created. Rows from the sheet are marked source = 'sheet';
// sets logged in the app are never touched. Body weight works the same way (Kyle's Weight
// column). Each run reads the whole sheet again, so it is safe to run any number of times.
//
// The first run for a sheet records everything already in it as done (see planCells), so
// only data added from then on is imported.
//
// Anything that cannot be imported (an exercise name that is not mapped yet, a cell that is
// not "weight x reps", a sheet that cannot be read) is skipped and reported in one Discord
// message per sheet, and tried again on the next run.
//
// Vercel Cron calls this at 14:15 / 15:15 and 17:00 / 18:00 UTC; only the calls that land in
// the 3pm and 6pm London hours run, so it stays at 3:15pm and 6pm through summer and winter time.
// Run it by hand with the passcode (GET /api/sheet-sync) to sync straight away.

// Runs at 3:15pm and 6pm UK time (see vercel.json).
const SYNC_HOURS = [15, 18];

async function fetchTab(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('could not reach Google Sheets');
  }
  if (res.status === 401 || res.status === 403) throw new Error('the sheet is not shared as "Anyone with the link"');
  if (!res.ok) throw new Error(`Google Sheets returned ${res.status}`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Google Sheets sent a web page instead of the sheet (is it still shared?)');
  return text;
}

async function syncSheet(sql, config, today, exerciseIds) {
  const sheetId = process.env[config.idEnv];
  if (!sheetId) return { person: config.person, failure: `${config.idEnv} is not set in Vercel` };

  const [person] = await sql`select id from people where lower(name) = ${config.person.toLowerCase()}`;
  if (!person) return { person: config.person, failure: `there is no one called ${config.person} in FRIFT` };

  const cells = [];
  const bodyWeights = [];
  for (const [i, tab] of config.tabs.entries()) {
    let text;
    try {
      text = await fetchTab(tabCsvUrl(sheetId, tab));
    } catch (err) {
      return { person: config.person, failure: `could not read the sheet: ${err.message}` };
    }
    const read = readTab(text, config, i);
    cells.push(...read.cells);
    bodyWeights.push(...read.bodyWeights);
  }

  const seenRows = await sql`
    select cell, value, entry_id, to_char(bw_date, 'YYYY-MM-DD') as bw_date
    from sheet_cells where sheet = ${config.key}::text`;
  const seen = new Map(seenRows.map((r) => [r.cell, r]));
  const seeding = seen.size === 0;

  let loggedDays = new Set();
  let bwDates = new Set();
  if (seeding) {
    const days = await sql`
      select distinct to_char(entry_date, 'YYYY-MM-DD') as date, exercise
      from entries where person_id = ${person.id}::int`;
    loggedDays = new Set(days.map((d) => `${d.date}|${d.exercise}`));
    const bws = await sql`select to_char(entry_date, 'YYYY-MM-DD') as date from body_weights where person_id = ${person.id}::int`;
    bwDates = new Set(bws.map((b) => b.date));
  }

  const plan = planCells({ cells, bodyWeights, seen, config, today, seeding, loggedDays, bwDates, exerciseIds });

  for (const { key, value } of plan.remember) {
    await sql`
      insert into sheet_cells (sheet, cell, value) values (${config.key}::text, ${key}::text, ${value}::text)
      on conflict (sheet, cell) do update set value = excluded.value, updated_at = now()`;
  }

  // New sets, dated today, each numbered after whatever is already logged that day. The set
  // and its sheet_cells record are saved in one statement.
  for (const s of plan.newSets) {
    await sql`
      with ins as (
        insert into entries (person_id, exercise, entry_date, set_number, weight, reps, equipment, source)
        select ${person.id}::int, ${s.exercise}::text, ${today}::date,
               (select coalesce(max(set_number), 0) + 1 from entries
                 where person_id = ${person.id}::int and exercise = ${s.exercise}::text and entry_date = ${today}::date),
               ${s.weight}::numeric, ${s.reps}::int, ${s.equipment}::text, 'sheet'
        returning id
      )
      insert into sheet_cells (sheet, cell, value, entry_id)
      select ${config.key}::text, ${s.key}::text, ${s.value}::text, id from ins
      on conflict (sheet, cell) do update set value = excluded.value, entry_id = excluded.entry_id, updated_at = now()`;
  }

  // Edited cells change the set they created (only ever a sheet set; its date stays).
  for (const u of plan.updates) {
    await sql.transaction([
      sql`update entries set weight = ${u.weight}::numeric, reps = ${u.reps}::int
          where id = ${u.entryId}::int and source = 'sheet'`,
      sql`update sheet_cells set value = ${u.value}::text, updated_at = now()
          where sheet = ${config.key}::text and cell = ${u.key}::text`,
    ]);
  }

  // Body weight, dated today. A reading logged in the app that day is never replaced; the
  // cell is then just recorded.
  for (const b of plan.newBodyWeights) {
    await sql`
      with ins as (
        insert into body_weights (person_id, entry_date, weight_kg, source)
        values (${person.id}::int, ${today}::date, ${b.kg}::numeric, 'sheet')
        on conflict (person_id, entry_date) do update set weight_kg = excluded.weight_kg, created_at = now()
          where body_weights.source = 'sheet'
        returning entry_date
      )
      insert into sheet_cells (sheet, cell, value, bw_date)
      values (${config.key}::text, ${b.key}::text, ${b.value}::text, (select entry_date from ins))
      on conflict (sheet, cell) do update set value = excluded.value, bw_date = excluded.bw_date, updated_at = now()`;
  }
  for (const b of plan.bwUpdates) {
    await sql.transaction([
      sql`update body_weights set weight_kg = ${b.kg}::numeric
          where person_id = ${person.id}::int and entry_date = ${b.date}::date and source = 'sheet'`,
      sql`update sheet_cells set value = ${b.value}::text, updated_at = now()
          where sheet = ${config.key}::text and cell = ${b.key}::text`,
    ]);
  }

  return {
    person: config.person,
    firstRun: seeding,
    added: plan.newSets.length,
    updated: plan.updates.length,
    bodyWeightsAdded: plan.newBodyWeights.length,
    recordedWithoutImporting: plan.remember.length,
    unmapped: plan.unmapped,
    problems: plan.problems,
  };
}

export default route(
  {
    async GET(req) {
      const scheduled = isCron(req);
      const now = londonNow();
      if (scheduled && !SYNC_HOURS.includes(now.hour)) {
        return { skipped: `It is ${now.hour}:00 in London, not a sync time.` };
      }

      const sql = db();
      const exerciseIds = new Set((await sql`select id from exercises`).map((e) => e.id));
      const results = [];
      for (const config of SHEETS) {
        let result;
        try {
          result = await syncSheet(sql, config, now.date, exerciseIds);
        } catch (err) {
          console.error(err);
          result = { person: config.person, failure: 'something went wrong on the server (see the Vercel logs)' };
        }
        results.push(result);

        const warning = warningMessage(result.person, result);
        if (warning && process.env.DISCORD_WEBHOOK_URL) {
          try {
            await postToDiscord(process.env.DISCORD_WEBHOOK_URL, { username: 'FRIFT', allowed_mentions: { parse: [] }, content: warning });
          } catch (err) {
            console.error('Could not post the sheet sync warning to Discord', err);
          }
        }
      }

      console.log('Sheet sync', JSON.stringify({ date: now.date, results }));
      if (results.every((r) => r.failure)) throw new HttpError(502, results.map((r) => `${r.person}: ${r.failure}`).join(' '));
      return { date: now.date, results };
    },
  },
  { allowCron: true },
);
