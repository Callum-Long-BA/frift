import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseExerciseName, parseId, slugify } from './_validate.js';
import { MAX_EXERCISES } from '../src/lib/constants.js';

export default route({
  // In the order they were added, so charts keep a stable layout.
  async GET() {
    const sql = db();
    return await sql`
      select id, name, kind, equipment_choice, created_by, sort_order
      from exercises
      order by sort_order, id`;
  },

  // { name, personId, equipmentChoice? }. New exercises are always weight x reps.
  // equipmentChoice = true lets people log each set as barbell or dumbbell.
  async POST(req) {
    const name = parseExerciseName(req.body?.name);
    const id = slugify(name);
    const createdBy =
      req.body?.personId === undefined || req.body?.personId === null
        ? null
        : parseId(req.body.personId, 'Person');
    const equipmentChoice = req.body?.equipmentChoice === true;
    const sql = db();

    try {
      // The cap is checked inside the insert, so two people adding at once cannot both squeeze past it.
      const rows = await sql`
        insert into exercises (id, name, kind, equipment_choice, created_by)
        select ${id}::text, ${name}::text, 'strength'::text, ${equipmentChoice}::boolean, ${createdBy}::int
        where (select count(*) from exercises) < ${MAX_EXERCISES}::int
        returning id, name, kind, equipment_choice, created_by, sort_order`;
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
