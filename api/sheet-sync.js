import { db } from './_db.js';
import { route, isCron, HttpError } from './_http.js';
import { londonNow } from './_discord.js';
import { postToDiscord } from './_webhook.js';
import { SHEETS, START_DATE, planSync, readTab, sheetSessions, tabCsvUrl, warningMessage } from './_sheets.js';

// Copies new sets from people's own Google Sheets into FRIFT at 6pm UK time (see
// api/_sheets.js for which sheets and how they are read). Only dates from START_DATE on.
//
// Each run reads the whole sheet again and compares it with FRIFT, so it is safe to run any
// number of times. For each exercise and day: if nothing is logged yet, the sheet's sets are
// added; if the sets there came from the sheet and the sheet has changed, they are replaced;
// if anything was logged in the app, that day's exercise is left alone. Rows from the sheet
// are marked source = 'sheet'. Body weight works the same way (Kyle's Weight column).
//
// Anything that cannot be imported (an exercise name that is not mapped yet, a cell that is
// not "weight x reps", a sheet that cannot be read) is skipped and reported in one Discord
// message per sheet, and tried again on the next run.
//
// Vercel Cron calls this at 17:00 and 18:00 UTC; only the call in the 6pm London hour runs.
// Run it by hand with the passcode (GET /api/sheet-sync) to sync straight away.

const SYNC_HOUR = 18;

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

  const sets = [];
  const bodyWeights = [];
  const problems = [];
  for (const tab of config.tabs) {
    let text;
    try {
      text = await fetchTab(tabCsvUrl(sheetId, tab));
    } catch (err) {
      return { person: config.person, failure: `could not read the sheet: ${err.message}` };
    }
    const read = readTab(text, config);
    sets.push(...read.sets);
    bodyWeights.push(...read.bodyWeights);
    problems.push(...read.problems.filter((p) => !p.date || (p.date >= START_DATE && p.date <= today)));
  }

  const { sessions, unmapped } = sheetSessions(sets, config, today);
  // A mapped exercise that does not exist in FRIFT (yet) is reported, not imported.
  const missing = new Set();
  for (const [key, session] of sessions) {
    if (!exerciseIds.has(session.exercise)) {
      sessions.delete(key);
      missing.add(session.exercise);
    }
  }
  for (const exercise of missing) problems.push({ name: exercise, message: 'is not an exercise in FRIFT' });

  const existing = await sql`
    select exercise, to_char(entry_date, 'YYYY-MM-DD') as date, set_number,
           weight::float8 as weight, reps, equipment, source
    from entries
    where person_id = ${person.id}::int and entry_date >= ${START_DATE}::date`;
  const plan = planSync(sessions, existing);

  for (const session of [...plan.add, ...plan.replace]) {
    const numbers = session.sets.map((_, i) => i + 1);
    const weights = session.sets.map((s) => s.weight);
    const reps = session.sets.map((s) => s.reps);
    // Replace only rows that came from the sheet, and never if the app has logged that
    // exercise on that day since this run read it. Both statements run as one transaction.
    await sql.transaction([
      sql`delete from entries
          where person_id = ${person.id}::int and exercise = ${session.exercise}::text
            and entry_date = ${session.date}::date and source = 'sheet'`,
      sql`insert into entries (person_id, exercise, entry_date, set_number, weight, reps, equipment, source)
          select ${person.id}::int, ${session.exercise}::text, ${session.date}::date, s.n, s.w, s.r,
                 ${session.equipment}::text, 'sheet'
          from unnest(${numbers}::int[], ${weights}::numeric[], ${reps}::int[]) as s(n, w, r)
          where not exists (
            select 1 from entries
            where person_id = ${person.id}::int and exercise = ${session.exercise}::text
              and entry_date = ${session.date}::date
          )`,
    ]);
  }

  let bodyWeightsSaved = 0;
  for (const { date, kg } of bodyWeights) {
    if (date < START_DATE || date > today) continue;
    // A reading logged in the app (source null) is never replaced.
    const rows = await sql`
      insert into body_weights (person_id, entry_date, weight_kg, source)
      values (${person.id}::int, ${date}::date, ${kg}::numeric, 'sheet')
      on conflict (person_id, entry_date) do update set weight_kg = excluded.weight_kg, created_at = now()
        where body_weights.source = 'sheet' and body_weights.weight_kg <> excluded.weight_kg
      returning entry_date`;
    bodyWeightsSaved += rows.length;
  }

  return {
    person: config.person,
    added: plan.add.length,
    replaced: plan.replace.length,
    unchanged: plan.unchanged.length,
    leftForApp: plan.app.length,
    bodyWeightsSaved,
    unmapped,
    problems,
  };
}

export default route(
  {
    async GET(req) {
      const scheduled = isCron(req);
      const now = londonNow();
      if (scheduled && now.hour !== SYNC_HOUR) {
        return { skipped: `It is ${now.hour}:00 in London, not ${SYNC_HOUR}:00.` };
      }
      if (now.date < START_DATE) return { skipped: `The sheet sync starts on ${START_DATE}.` };

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
