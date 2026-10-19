import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseNewEntry, parseId } from './_validate.js';
import { assertMember, memberIds } from './_groups.js';

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
  // Everything logged by the caller's group, oldest first. Groups are tiny, so the browser
  // does the charting maths.
  async GET(req) {
    const sql = db();
    const members = await memberIds(sql, req.group.id);
    const rows = await sql`
      select id, person_id, exercise,
             to_char(entry_date, 'YYYY-MM-DD') as date,
             set_number,
             weight::float8 as weight,
             reps,
             duration_min::float8 as duration_min,
             equipment,
             run_type,
             distance_km::float8 as distance_km,
             duration_sec,
             lengths,
             speed_kmh::float8 as speed_kmh,
             incline_pct::float8 as incline_pct
      from entries
      order by entry_date, set_number, id`;
    return rows.filter((r) => members.has(r.person_id));
  },

  // Strength: { personId, exercise, date, equipment?, sets: [{ weight, reps }] }
  //   Reps-only exercises send sets: [{ reps }] and store a null weight.
  //   Set numbers continue from whatever that person already logged that day.
  //   equipment ('barbell' | 'dumbbell') is required for exercises that offer the choice.
  // Cardio:   { personId, exercise: 'cardio', date, durationMin, speedKmh, inclinePct }
  // Running:  { personId, exercise: 'running', date, runType, runs: [{ distanceKm, seconds }] }
  //   One run for easy and tempo, one per interval for intervals. Numbered like sets.
  // Swimming: { personId, exercise: 'swimming', date, runType: 'easy', runs: [{ distanceKm, seconds, lengths }] }
  //   One swim at a time; lengths is the number of pool lengths that distanceKm came from.
  async POST(req) {
    const sql = db();
    const exercises = await sql`select id, kind, equipment_choice from exercises`;
    const entry = parseNewEntry(req.body, exercises);
    await assertMember(sql, req.group.id, entry.personId);
    try {
      if (entry.kind === 'cardio') {
        return await sql`
          insert into entries (person_id, exercise, entry_date, set_number, duration_min, speed_kmh, incline_pct)
          values (${entry.personId}::int, ${entry.exercise}::text, ${entry.date}::date, 1, ${entry.durationMin}::numeric,
                  ${entry.speedKmh}::numeric, ${entry.inclinePct}::numeric)
          returning id, person_id, exercise,
                    to_char(entry_date, 'YYYY-MM-DD') as date,
                    set_number, weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment,
                    run_type, distance_km::float8 as distance_km, duration_sec, lengths,
                    speed_kmh::float8 as speed_kmh, incline_pct::float8 as incline_pct`;
      }

      if (entry.kind === 'running') {
        const numbers = entry.runs.map((_, i) => i + 1);
        const distances = entry.runs.map((r) => r.distanceKm);
        const seconds = entry.runs.map((r) => r.seconds);
        const lengths = entry.runs.map((r) => r.lengths);
        return await sql`
          insert into entries (person_id, exercise, entry_date, set_number, run_type, distance_km, duration_sec, lengths)
          select ${entry.personId}::int,
                 ${entry.exercise}::text,
                 ${entry.date}::date,
                 (select coalesce(max(set_number), 0) from entries
                   where person_id = ${entry.personId}::int
                     and exercise = ${entry.exercise}::text
                     and entry_date = ${entry.date}::date) + s.n,
                 ${entry.runType}::text,
                 s.d,
                 s.t,
                 s.l
          from unnest(${numbers}::int[], ${distances}::numeric[], ${seconds}::int[], ${lengths}::int[]) as s(n, d, t, l)
          returning id, person_id, exercise,
                    to_char(entry_date, 'YYYY-MM-DD') as date,
                    set_number, weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment,
                    run_type, distance_km::float8 as distance_km, duration_sec, lengths,
                    speed_kmh::float8 as speed_kmh, incline_pct::float8 as incline_pct`;
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
                  set_number, weight::float8 as weight, reps, duration_min::float8 as duration_min, equipment,
                    run_type, distance_km::float8 as distance_km, duration_sec, lengths,
                    speed_kmh::float8 as speed_kmh, incline_pct::float8 as incline_pct`;
    } catch (err) {
      throw translateDbError(err, entry);
    }
  },

  // ?id=12&personId=3. Only deletes if the entry belongs to that person.
  async DELETE(req) {
    const id = parseId(req.query?.id, 'Entry');
    const personId = parseId(req.query?.personId, 'Person');
    const sql = db();
    await assertMember(sql, req.group.id, personId);
    const rows = await sql`
      delete from entries where id = ${id}::int and person_id = ${personId}::int
      returning id`;
    if (rows.length === 0) throw new HttpError(404, 'That entry no longer exists.');
    return { id: rows[0].id };
  },
});
