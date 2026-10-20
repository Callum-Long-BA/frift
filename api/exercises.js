import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseExerciseName, parseId, slugify } from './_validate.js';
import { assertMember } from './_groups.js';
import { ADDABLE_KINDS, EQUIPMENT, MAX_EXERCISES, MUSCLE_GROUPS } from '../src/lib/constants.js';

export default route({
  // In the order they were added, so charts keep a stable layout.
  async GET() {
    const sql = db();
    return await sql`
      select id, name, kind, equipment_choice, equipment_options, muscle_group, created_by, sort_order
      from exercises
      order by sort_order, id`;
  },

  // { name, personId, kind?, equipmentOptions?, equipmentChoice?, muscleGroup? }. kind is
  // 'strength' (weight x reps, the default) or 'reps' (reps only). equipmentOptions (2 or more
  // of EQUIPMENT) lets people log each set as one of them; the older equipmentChoice = true
  // means barbell or dumbbell. muscleGroup (one of MUSCLE_GROUPS) is required. All three only
  // apply to weighted exercises. The name is stored in Title Case and singular.
  async POST(req) {
    const name = parseExerciseName(req.body?.name);
    const id = slugify(name);
    const createdBy =
      req.body?.personId === undefined || req.body?.personId === null
        ? null
        : parseId(req.body.personId, 'Person');
    const kind = req.body?.kind ?? 'strength';
    if (!ADDABLE_KINDS.includes(kind)) throw new HttpError(400, 'Exercise type must be weight × reps or reps only.');
    let options = [];
    if (kind === 'strength') {
      if (Array.isArray(req.body?.equipmentOptions)) {
        options = EQUIPMENT.filter((e) => req.body.equipmentOptions.includes(e));
      } else if (req.body?.equipmentChoice === true) options = ['barbell', 'dumbbell'];
    }
    const equipmentChoice = options.length > 1;
    const equipmentOptions = equipmentChoice ? options : null;
    let muscleGroup = null;
    if (kind === 'strength') {
      muscleGroup = req.body?.muscleGroup;
      if (!MUSCLE_GROUPS.some((g) => g.key === muscleGroup)) throw new HttpError(400, 'Choose a muscle group.');
    }
    const sql = db();
    if (createdBy !== null) await assertMember(sql, req.group.id, createdBy);

    try {
      // The cap is checked inside the insert, so two people adding at once cannot both squeeze past it.
      const rows = await sql`
        insert into exercises (id, name, kind, equipment_choice, equipment_options, muscle_group, created_by)
        select ${id}::text, ${name}::text, ${kind}::text, ${equipmentChoice}::boolean, ${equipmentOptions}::text[],
               ${muscleGroup}::text, ${createdBy}::int
        where (select count(*) from exercises) < ${MAX_EXERCISES}::int
        returning id, name, kind, equipment_choice, equipment_options, muscle_group, created_by, sort_order`;
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
