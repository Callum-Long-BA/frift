import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { MAX_ROUTINES_PER_PERSON, copyName, parseId, parseRoutine } from './_validate.js';

// Every routine with its exercise ids: [{ id, person_id, name, exercise_ids }].
async function allRoutines(sql, where = null) {
  const rows = await sql`
    select r.id, r.person_id, r.name,
           coalesce(array_agg(x.exercise_id order by x.exercise_id) filter (where x.exercise_id is not null), '{}') as exercise_ids
    from routines r
    left join routine_exercises x on x.routine_id = r.id
    group by r.id
    order by r.person_id, lower(r.name)`;
  return where ? rows.filter(where) : rows;
}

async function exerciseIdSet(sql) {
  return new Set((await sql`select id from exercises`).map((e) => e.id));
}

async function saveExercises(sql, routineId, exerciseIds) {
  await sql.transaction([
    sql`delete from routine_exercises where routine_id = ${routineId}::int`,
    sql`insert into routine_exercises (routine_id, exercise_id)
        select ${routineId}::int, unnest(${exerciseIds}::text[])`,
  ]);
}

function translate(err) {
  if (err instanceof HttpError) return err;
  if (err?.code === '23505') return new HttpError(409, 'You already have a routine with that name.');
  if (err?.code === '23503') return new HttpError(400, 'That person or exercise does not exist.');
  return err;
}

export default route({
  async GET() {
    return allRoutines(db());
  },

  // Create: { personId, name, exerciseIds }.
  // Copy:   { copyFrom: routineId, toPersonId } - a copy for another person, renamed
  //         "Name (from Owner)" if they already have one with that name.
  async POST(req) {
    const sql = db();
    try {
      if (req.body?.copyFrom !== undefined) {
        const fromId = parseId(req.body.copyFrom, 'Routine');
        const toPersonId = parseId(req.body.toPersonId, 'Person');
        const [source] = await allRoutines(sql, (r) => r.id === fromId);
        if (!source) throw new HttpError(404, 'That routine no longer exists.');
        const [owner] = await sql`select name from people where id = ${source.person_id}::int`;
        const theirs = await sql`select name from routines where person_id = ${toPersonId}::int`;
        if (theirs.length >= MAX_ROUTINES_PER_PERSON) throw new HttpError(409, `They already have ${MAX_ROUTINES_PER_PERSON} routines.`);
        const name = copyName(source.name, owner?.name ?? 'someone', theirs.map((r) => r.name));
        const [created] = await sql`insert into routines (person_id, name) values (${toPersonId}::int, ${name}::text) returning id`;
        await saveExercises(sql, created.id, source.exercise_ids);
        return (await allRoutines(sql, (r) => r.id === created.id))[0];
      }

      const personId = parseId(req.body?.personId, 'Person');
      const { name, exerciseIds } = parseRoutine(req.body, await exerciseIdSet(sql));
      const [{ count }] = await sql`select count(*)::int as count from routines where person_id = ${personId}::int`;
      if (count >= MAX_ROUTINES_PER_PERSON) throw new HttpError(409, `You can have up to ${MAX_ROUTINES_PER_PERSON} routines.`);
      const [created] = await sql`insert into routines (person_id, name) values (${personId}::int, ${name}::text) returning id`;
      await saveExercises(sql, created.id, exerciseIds);
      return (await allRoutines(sql, (r) => r.id === created.id))[0];
    } catch (err) {
      throw translate(err);
    }
  },

  // Rename or change exercises: { id, personId, name, exerciseIds }. Only the owner's.
  async PUT(req) {
    const sql = db();
    try {
      const id = parseId(req.body?.id, 'Routine');
      const personId = parseId(req.body?.personId, 'Person');
      const { name, exerciseIds } = parseRoutine(req.body, await exerciseIdSet(sql));
      const rows = await sql`
        update routines set name = ${name}::text
        where id = ${id}::int and person_id = ${personId}::int
        returning id`;
      if (rows.length === 0) throw new HttpError(404, 'That routine no longer exists.');
      await saveExercises(sql, id, exerciseIds);
      return (await allRoutines(sql, (r) => r.id === id))[0];
    } catch (err) {
      throw translate(err);
    }
  },

  // ?id=4&personId=2. Only the owner's.
  async DELETE(req) {
    const id = parseId(req.query?.id, 'Routine');
    const personId = parseId(req.query?.personId, 'Person');
    const rows = await db()`delete from routines where id = ${id}::int and person_id = ${personId}::int returning id`;
    if (rows.length === 0) throw new HttpError(404, 'That routine no longer exists.');
    return { id };
  },
});
