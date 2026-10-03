import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseId } from './_validate.js';

const MAX_NOTE = 300;

export default route({
  // Every note: [{ person_id, exercise_id, note, updated_at }].
  async GET() {
    return db()`
      select person_id, exercise_id, note, to_char(updated_at, 'YYYY-MM-DD') as updated_at
      from exercise_notes`;
  },

  // { personId, exerciseId, note }. Replaces that person's note for the exercise; an empty
  // note deletes it. Returns the note, or { deleted: true }.
  async PUT(req) {
    const personId = parseId(req.body?.personId, 'Person');
    const exerciseId = String(req.body?.exerciseId ?? '');
    const note = String(req.body?.note ?? '').trim();
    if (note.length > MAX_NOTE) throw new HttpError(400, `Notes can be up to ${MAX_NOTE} characters.`);
    const sql = db();
    if (!note) {
      await sql`delete from exercise_notes where person_id = ${personId}::int and exercise_id = ${exerciseId}::text`;
      return { person_id: personId, exercise_id: exerciseId, deleted: true };
    }
    try {
      const [row] = await sql`
        insert into exercise_notes (person_id, exercise_id, note)
        values (${personId}::int, ${exerciseId}::text, ${note}::text)
        on conflict (person_id, exercise_id) do update set note = excluded.note, updated_at = now()
        returning person_id, exercise_id, note, to_char(updated_at, 'YYYY-MM-DD') as updated_at`;
      return row;
    } catch (err) {
      if (err?.code === '23503') throw new HttpError(400, 'That person or exercise does not exist.');
      throw err;
    }
  },
});
