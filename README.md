# FRIFT

Shared lifting progress for a small group. One line chart per exercise, one coloured line per person.

- Front end: Vite + React + Recharts
- API: Vercel Functions in `/api`
- Database: Neon Postgres (added through the Vercel Marketplace)
- Access: one shared passcode, checked on every API call

## How the numbers work

- Every set is logged separately (weight and reps).
- For each person, exercise and day, only the **last 3 sets** count. The chart value is the sum of weight x reps across those sets, so doing 5 sets does not beat doing 3.
- Cardio is minutes, one entry per person per day.
- **Charts show** switches between total weight and % change. % change is measured from each person's own first logged day for that exercise, so both lines start at 0%.
- Choosing your name in the top-left cell thickens your line, dims everyone else's, and switches on the + buttons. That choice is remembered in your browser only.

## Set up

### 1. Push to GitHub

```bash
cd frift
git init
git add .
git commit -m "FRIFT"
# create an empty repo on GitHub called frift, then:
git remote add origin git@github.com:<your-username>/frift.git
git branch -M main
git push -u origin main
```

### 2. Import into Vercel

Vercel dashboard > Add New > Project > pick the `frift` repo. Vercel detects Vite by itself, so leave the defaults and deploy. The first deploy will load but show errors until steps 3 and 4 are done.

### 3. Add the database

In the Vercel project, open **Storage** (or the Marketplace), add **Neon**, and connect it to the project for all environments. This sets `DATABASE_URL` for you.

Then open the database in Neon (there is an "Open in Neon" link on the Vercel storage page), go to the **SQL Editor**, paste in the contents of `schema.sql`, and run it.

### 4. Set the passcode

Project > Settings > Environment Variables > add `FRIFT_PASSCODE` with whatever passcode you want to give your friends. Apply it to Production, Preview and Development, then **redeploy** (env vars only apply to new deployments).

### 5. Point frift.callumlong.com at it

1. Vercel project > Settings > Domains > add `frift.callumlong.com`.
2. In your DNS provider (Cloudflare, if that is where callumlong.com lives) add a `CNAME` record: name `frift`, target as shown by Vercel (usually `cname.vercel-dns.com`).
3. In Cloudflare set the record to **DNS only** (grey cloud) so Vercel can issue the certificate. Vercel shows a green tick once it is working.

## Run it locally

The API only runs under the Vercel CLI, not plain `vite`.

```bash
npm install
npm i -g vercel
vercel link
vercel env pull .env.local
npm run dev          # runs vercel dev: front end and /api together
```

`npm test` runs the unit tests for the chart maths, passcode check and input validation. It needs no database.

## Changing things

- **Add an exercise:** add one line to `EXERCISES` in `src/lib/constants.js`. No database change.
- **Change how many sets count:** `COUNTED_SETS` in the same file.
- **Fix a mistake:** open the + dialog for that exercise, pick the date, and use Delete next to the entry. You can only delete your own.
- **Rename someone or remove them:** do it in the Neon SQL editor, e.g. `update people set name = 'Sam' where id = 2;`

## Limits worth knowing

- The "who are you" dropdown is not a login. Anyone with the passcode can log as anyone. That is fine for friends, but do not treat it as security.
- The browser loads all entries and calculates the charts itself. That is comfortable for years of data from under 10 people. If it ever feels slow, add a date filter to `GET /api/entries`.
- People are capped at 10 (`MAX_PEOPLE`), matching the 10 line colours.
- Weights are in kg.
