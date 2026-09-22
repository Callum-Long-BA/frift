import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { readSheet } from './_sheet.js';
import { parseNewEntry } from './_validate.js';

// Imports new rows from the Google Sheet at SHEET_CSV_URL (the sheet published to the web
// as CSV). Vercel Cron calls this once a day (see vercel.json). It can also be run by hand
// with the passcode: GET /api/import-sheet.
//
// Each sheet row is one set (or one cardio session). A row is logged once: its fingerprint
// is recorded in sheet_imports alongside the new entry, in the same statement. Rows that
// cannot be logged (unknown name, bad numbers) are reported and tried again next run, so
// fixing the sheet or adding the person is enough.

async function fetchSheet(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HttpError(502, 'Could not reach the Google Sheet.');
  }
  if (!res.ok) throw new HttpError(502, `The Google Sheet returned ${res.status}. Check SHEET_CSV_URL.`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new HttpError(502, 'SHEET_CSV_URL returned a web page, not CSV. Publish the sheet to the web as CSV and use that link.');
  }
  return text;
}

// One set, plus its fingerprint, in one statement: either both are saved or neither.
// The "not exists" check means a row already imported is never logged again.
async function insertSet(sql, entry, set, fingerprint) {
  return sql`
    with ins as (
      insert into entries (person_id, exercise, entry_date, set_number, weight, reps, equipment)
      select ${entry.personId}::int,
             ${entry.exercise}::text,
             ${entry.date}::date,
             (select coalesce(max(set_number), 0) + 1 from entries
               where person_id = ${entry.personId}::int
                 and exercise = ${entry.exercise}::text
                 and entry_date = ${entry.date}::date),
             ${set.weight}::numeric,
             ${set.reps}::int,
             ${entry.equipment}::text
      where not exists (select 1 from sheet_imports where fingerprint = ${fingerprint}::text)
      returning id
    )
    insert into sheet_imports (fingerprint, entry_id)
    select ${fingerprint}::text, id from ins
    returning entry_id`;
}

async function insertCardio(sql, entry, fingerprint) {
  return sql`
    with ins as (
      insert into entries (person_id, exercise, entry_date, set_number, duration_min)
      select ${entry.personId}::int, ${entry.exercise}::text, ${entry.date}::date, 1, ${entry.durationMin}::numeric
      where not exists (select 1 from sheet_imports where fingerprint = ${fingerprint}::text)
      returning id
    )
    insert into sheet_imports (fingerprint, entry_id)
    select ${fingerprint}::text, id from ins
    returning entry_id`;
}

export default route(
  {
    async GET() {
      const url = process.env.SHEET_CSV_URL;
      if (!url) throw new HttpError(500, 'SHEET_CSV_URL is not set on the server.');

      const { rows, errors } = readSheet(await fetchSheet(url));
      const sql = db();
      const [people, exercises, done] = await Promise.all([
        sql`select id, name from people`,
        sql`select id, name, kind, equipment_choice from exercises`,
        sql`select fingerprint from sheet_imports`,
      ]);
      const doneSet = new Set(done.map((r) => r.fingerprint));
      const personByName = new Map(people.map((p) => [p.name.toLowerCase(), p]));
      const exerciseByName = new Map();
      for (const e of exercises) {
        exerciseByName.set(e.name.toLowerCase(), e);
        exerciseByName.set(e.id, e);
      }

      let imported = 0;
      let alreadyImported = 0;
      let skipped = 0;

      for (const row of rows) {
        if (doneSet.has(row.fingerprint)) {
          alreadyImported++;
          continue;
        }
        const person = personByName.get(row.name.toLowerCase());
        const exercise = exerciseByName.get(row.exercise.toLowerCase());
        if (!person) {
          errors.push(`Row ${row.line}: no one called "${row.name}" in FRIFT.`);
          continue;
        }
        if (!exercise) {
          errors.push(`Row ${row.line}: no exercise called "${row.exercise}" in FRIFT.`);
          continue;
        }

        let entry;
        try {
          entry = parseNewEntry(
            exercise.kind === 'cardio'
              ? { personId: person.id, exercise: exercise.id, date: row.date, durationMin: row.minutes }
              : {
                  personId: person.id,
                  exercise: exercise.id,
                  date: row.date,
                  // Exercises that offer the choice need one; a blank cell counts as barbell.
                  equipment: row.equipment || 'barbell',
                  sets: [{ weight: row.weight, reps: row.reps }],
                },
            exercises,
          );
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          errors.push(`Row ${row.line}: ${err.message.replace(/^Set 1: /, '')}`);
          continue;
        }

        try {
          const result =
            entry.kind === 'cardio'
              ? await insertCardio(sql, entry, row.fingerprint)
              : await insertSet(sql, entry, entry.sets[0], row.fingerprint);
          if (result.length > 0) imported++;
          else alreadyImported++;
        } catch (err) {
          // Cardio is one per person per day. If it was already logged in the app, remember
          // the row as handled (with no entry) so it is not retried every day.
          if (err?.code === '23505' && entry.kind === 'cardio') {
            await sql`insert into sheet_imports (fingerprint, entry_id) values (${row.fingerprint}::text, null)
                      on conflict do nothing`;
            skipped++;
            errors.push(`Row ${row.line}: ${person.name} already has cardio logged on ${row.date}, so this row was skipped.`);
            continue;
          }
          if (err?.code === '23503') {
            errors.push(`Row ${row.line}: that person or exercise no longer exists.`);
            continue;
          }
          throw err;
        }
      }

      const summary = { rows: rows.length, imported, alreadyImported, skipped, errors };
      console.log('Sheet import', JSON.stringify(summary));
      return summary;
    },
  },
  { allowCron: true },
);
