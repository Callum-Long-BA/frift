import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseNewEntry, parseId } from './_validate.js';

function translateDbError(err, entry) {
  if (err?.code === '23505') {
    return new HttpError(
      409,
      entry.kind === 'cardio'
        ? 'Cardio is already logged for that day. Delete it first to change it.'
        : 'Those sets clashed with sets saved a moment ago. Refresh and try again.',
    );
  }
  if (err?.code === '23503') return new HttpError(400, 'That person does not exist.');
  return err;
}

export default route({
  // Everything, oldest first. The group is tiny, so the browser does the charting maths.
  async GET() {
    const sql = db();
    return await sql`
      select id, person_id, exercise,
             to_char(entry_date, 'YYYY-MM-DD') as date,
             set_number,
             weight::float8 as weight,
             reps,
             duration_min::float8 as duration_min,
             equipment
      from entries
      order by entry_date, set_number, id`;
  },

  // Strength: { personId, exercise, date, equipment?, sets: [{ weight, reps }] }
  //   Set numbers continue from whatever that person already logged that day.
  //   equipment ('barbell' | 'dumbbell') is required for exercises that offer the choice.
  // Cardio:   { personId, exercise: 'cardio', date, durationMin }
  async POST(req) {
    const sql = db();
    const exercises = await sql`select id, kind, equipment_choice from exercises`;
    const entry = parseNewEntry(req.body, exercises);
    try {
      if (entry.kind === 'cardio') {
        return await sql`
          insert into entries (person_id, exercise, entry_date, set_number, duration_min)
          values (${entry.personId}::int, ${entry.exercise}::text, ${entry.date}::date, 1, ${entry.durationMin}::numeric)
          returning id, person_id, exercise,
                    to_char(entry_date, 'YYYY-MM-DD') as date,
                    set_number, weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment`;
      }

      const numbers = entry.sets.map((_, i) => i + 1);
      const weights = entry.sets.map((s) => s.weight);
      const reps = entry.sets.map((s) => s.reps);

      // One statement, so either every set is saved or none are.
      return await sql`
        insert into entries (person_id, exercise, entry_date, set_number, weight, reps, equipment)
        select ${entry.personId}::int,
               ${entry.exercise}::text,
               ${entry.date}::date,
               (select coalesce(max(set_number), 0) from entries
                 where person_id = ${entry.personId}::int
                   and exercise = ${entry.exercise}::text
                   and entry_date = ${entry.date}::date) + s.n,
               s.w,
               s.r,
               ${entry.equipment}::text
        from unnest(${numbers}::int[], ${weights}::numeric[], ${reps}::int[]) as s(n, w, r)
        returning id, person_id, exercise,
                  to_char(entry_date, 'YYYY-MM-DD') as date,
                  set_number, weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment`;
    } catch (err) {
      throw translateDbError(err, entry);
    }
  },

  // ?id=12&personId=3. Only deletes if the entry belongs to that person.
  async DELETE(req) {
    const id = parseId(req.query?.id, 'Entry');
    const personId = parseId(req.query?.personId, 'Person');
    const sql = db();
    const rows = await sql`
      delete from entries where id = ${id}::int and person_id = ${personId}::int
      returning id`;
    if (rows.length === 0) throw new HttpError(404, 'That entry no longer exists.');
    return { id: rows[0].id };
  },
});
