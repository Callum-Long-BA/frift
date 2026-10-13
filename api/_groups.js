import { db } from './_db.js';
import { HttpError } from './_http.js';

// Groups: each has a code people type to get in (see PasscodeGate). A person belongs to the
// groups they were added in (group_members), and anyone with people.all_groups (Callum) is in
// every group. Everything a person logs belongs to them, not to a group, so it shows in each
// group they are in.

// The group with this code, or null.
export async function findGroupByCode(code) {
  const text = String(code ?? '').trim();
  if (!text) return null;
  const [group] = await db()`select id, code from groups where code = ${text}::text`;
  return group ?? null;
}

// The ids of everyone in a group.
export async function memberIds(sql, groupId) {
  const rows = await sql`
    select id from people p
    where p.all_groups
       or exists (select 1 from group_members m where m.group_id = ${groupId}::int and m.person_id = p.id)`;
  return new Set(rows.map((r) => r.id));
}

// Throws unless the person is in the group, so one group cannot write another's data.
export async function assertMember(sql, groupId, personId) {
  const [row] = await sql`
    select 1 as ok from people p
    where p.id = ${personId}::int
      and (p.all_groups or exists (select 1 from group_members m where m.group_id = ${groupId}::int and m.person_id = p.id))`;
  if (!row) throw new HttpError(403, 'That person is not in this group.');
}
