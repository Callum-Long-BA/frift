import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseId, parseName, parsePoolLength } from './_validate.js';
import { assertMember } from './_groups.js';
import { MAX_PEOPLE, PERSON_COLOURS } from '../src/lib/constants.js';

// People in the caller's group: those who joined it, plus anyone in every group (Callum).
async function members(sql, groupId) {
  return sql`
    select id, name, colour, pool_length_m::float8 as pool_length_m from people p
    where p.all_groups
       or exists (select 1 from group_members m where m.group_id = ${groupId}::int and m.person_id = p.id)
    order by id`;
}

export default route({
  async GET(req) {
    return members(db(), req.group.id);
  },

  // { name }. Adds a person to the caller's group. Names are unique within a group, and each
  // new person gets a colour not yet used in that group.
  async POST(req) {
    const name = parseName(req.body?.name);
    const sql = db();

    const existing = await members(sql, req.group.id);
    if (existing.length >= MAX_PEOPLE) throw new HttpError(409, `A group is capped at ${MAX_PEOPLE} people.`);
    if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'Someone in this group already has that name.');
    }
    const used = new Set(existing.map((p) => p.colour));
    const colour = PERSON_COLOURS.find((c) => !used.has(c)) ?? PERSON_COLOURS[existing.length % PERSON_COLOURS.length];

    const [person] = await sql`
      with ins as (insert into people (name, colour) values (${name}::text, ${colour}::text) returning id, name, colour),
      joined as (insert into group_members (group_id, person_id) select ${req.group.id}::int, id from ins)
      select id, name, colour from ins`;
    return person;
  },

  // { personId, poolLengthM }. Saves that person's pool length, in metres, used to turn
  // lengths of the pool into a distance when they log a swim.
  async PUT(req) {
    const personId = parseId(req.body?.personId, 'Person');
    const poolLengthM = parsePoolLength(req.body?.poolLengthM);
    const sql = db();
    await assertMember(sql, req.group.id, personId);
    const rows = await sql`
      update people set pool_length_m = ${poolLengthM}::numeric where id = ${personId}::int
      returning id, name, colour, pool_length_m::float8 as pool_length_m`;
    if (rows.length === 0) throw new HttpError(404, 'That person no longer exists.');
    return rows[0];
  },
});
