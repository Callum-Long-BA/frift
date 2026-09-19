import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseExerciseName, parseId, slugify } from './_validate.js';
import { MAX_EXERCISES } from '../src/lib/constants.js';

export default route({
  // In the order they were added, so charts keep a stable layout.
  async GET() {
    const sql = db();
    return await sql`
      select id, name, kind, created_by, sort_order
      from exercises
      order by sort_order, id`;
  },

  // { name, personId }. New exercises are always weight x reps.
  async POST(req) {
    const name = parseExerciseName(req.body?.name);
    const id = slugify(name);
    const createdBy =
      req.body?.personId === undefined || req.body?.personId === null
        ? null
        : parseId(req.body.personId, 'Person');
    const sql = db();

    try {
      // The cap is checked inside the insert, so two people adding at once cannot both squeeze past it.
      const rows = await sql`
        insert into exercises (id, name, kind, created_by)
        select ${id}::text, ${name}::text, 'strength'::text, ${createdBy}::int
        where (select count(*) from exercises) < ${MAX_EXERCISES}::int
        returning id, name, kind, created_by, sort_order`;
      if (rows.length === 0) throw new HttpError(409, `FRIFT is capped at ${MAX_EXERCISES} exercises.`);
      return rows[0];
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err?.code === '23505') throw new HttpError(409, 'There is already an exercise with that name.');
      if (err?.code === '23503') throw new HttpError(400, 'That person does not exist.');
      throw err;
    }
  },
});
