import { db } from './_db.js';
import { route, HttpError } from './_http.js';
import { parseName } from './_validate.js';
import { MAX_PEOPLE, PERSON_COLOURS } from '../src/lib/constants.js';

export default route({
  async GET() {
    const sql = db();
    return await sql`select id, name, colour from people order by id`;
  },

  async POST(req) {
    const name = parseName(req.body?.name);
    const sql = db();

    const existing = await sql`select colour from people`;
    if (existing.length >= MAX_PEOPLE) {
      throw new HttpError(409, `FRIFT is capped at ${MAX_PEOPLE} people.`);
    }
    const used = new Set(existing.map((p) => p.colour));
    const colour =
      PERSON_COLOURS.find((c) => !used.has(c)) ?? PERSON_COLOURS[existing.length % PERSON_COLOURS.length];

    try {
      const rows = await sql`
        insert into people (name, colour) values (${name}, ${colour})
        returning id, name, colour`;
      return rows[0];
    } catch (err) {
      if (err?.code === '23505') throw new HttpError(409, 'Someone already has that name.');
      throw err;
    }
  },
});
