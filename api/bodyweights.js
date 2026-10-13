import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseBodyWeight } from './_validate.js';
import { assertMember, memberIds } from './_groups.js';

export default route({
  // Every reading by the caller's group, oldest first: { person_id, date, weight_kg }.
  async GET(req) {
    const sql = db();
    const members = await memberIds(sql, req.group.id);
    const rows = await sql`
      select person_id, to_char(entry_date, 'YYYY-MM-DD') as date, weight_kg::float8 as weight_kg
      from body_weights
      order by entry_date, person_id`;
    return rows.filter((r) => members.has(r.person_id));
  },

  // { personId, date, weightKg }. One reading per person per day: logging again that day
  // replaces it.
  async POST(req) {
    const { personId, date, weightKg } = parseBodyWeight(req.body);
    const sql = db();
    await assertMember(sql, req.group.id, personId);
    try {
      const rows = await sql`
        insert into body_weights (person_id, entry_date, weight_kg)
        values (${personId}::int, ${date}::date, ${weightKg}::numeric)
        on conflict (person_id, entry_date) do update set weight_kg = excluded.weight_kg, created_at = now()
        returning person_id, to_char(entry_date, 'YYYY-MM-DD') as date, weight_kg::float8 as weight_kg`;
      return rows[0];
    } catch (err) {
      if (err?.code === '23503') throw new HttpError(400, 'That person does not exist.');
      throw err;
    }
  },
});
