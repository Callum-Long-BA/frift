import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseDate, parseId, parseVo2max } from './_validate.js';
import { assertMember, memberIds } from './_groups.js';

export default route({
  // Every VO2 max score by the caller's group, oldest first: { person_id, date, value }.
  async GET(req) {
    const sql = db();
    const members = await memberIds(sql, req.group.id);
    const rows = await sql`
      select person_id, to_char(entry_date, 'YYYY-MM-DD') as date, value::float8 as value
      from vo2max_readings
      order by entry_date, person_id`;
    return rows.filter((r) => members.has(r.person_id));
  },

  // { personId, date, value }. One score per person per day: logging again that day replaces it.
  async POST(req) {
    const { personId, date, value } = parseVo2max(req.body);
    const sql = db();
    await assertMember(sql, req.group.id, personId);
    try {
      const rows = await sql`
        insert into vo2max_readings (person_id, entry_date, value)
        values (${personId}::int, ${date}::date, ${value}::numeric)
        on conflict (person_id, entry_date) do update set value = excluded.value, created_at = now()
        returning person_id, to_char(entry_date, 'YYYY-MM-DD') as date, value::float8 as value`;
      return rows[0];
    } catch (err) {
      if (err?.code === '23503') throw new HttpError(400, 'That person does not exist.');
      throw err;
    }
  },

  // ?personId=3&date=2026-10-20. Removes that person's score for that day.
  async DELETE(req) {
    const personId = parseId(req.query?.personId, 'Person');
    const date = parseDate(req.query?.date);
    const sql = db();
    await assertMember(sql, req.group.id, personId);
    await sql`delete from vo2max_readings where person_id = ${personId}::int and entry_date = ${date}::date`;
    return { personId, date };
  },
});
