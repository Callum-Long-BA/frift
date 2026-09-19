# FRIFT

Shared lifting progress for a small group. One line chart per exercise, one coloured line per person.

- Front end: Vite + React + Recharts
- API: Vercel Functions in `/api`
- Database: Neon Postgres (added through the Vercel Marketplace)
- Access: one shared passcode, checked on every API call

## How the numbers work

- Every set is logged separately (weight and reps).
- **Total weight:** for each person, exercise and day, only the **last 3 sets** count. The value is the sum of weight x reps across those sets, so doing 5 sets does not beat doing 3.
- **% change:** the total weight above, measured as % change from each person's own first logged day for that exercise, so every line starts at 0%.
- **Best set:** the single set with the highest weight x reps that day. This looks at **all** sets of the day, not just the last 3, so a strong early set still counts.
- **Cardio** is minutes, one entry per person per day, and looks the same in every mode.
- Hover a data point on any weight x reps chart to see every set each person did that day. Bold sets are the ones counting toward the chart in the current mode; faded sets are not.
- Choosing your name in the top-left cell thickens your line, dims everyone else's, and switches on the + buttons. That choice is remembered in your browser only.

## Exercises

- Anyone can add an exercise with the **Add exercise** tile at the end of the grid. New exercises are always weight x reps.
- New charts appear for everyone, in the order they were added. The limit is 20 exercises (`MAX_EXERCISES` in `src/lib/constants.js`).
- There is no delete in the app, on purpose, so nobody loses history to a mis-tap. To remove or rename one, use the Neon SQL editor (see below).

## Set up (first time)

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

Vercel dashboard > Add New > Project > pick the `frift` repo. Vercel detects Vite by itself, so leave the defaults and deploy.

### 3. Add the database

Add **Neon** from the Vercel Marketplace and connect it to the project so that `DATABASE_URL` is set. Then open the database in Neon, go to the **SQL Editor**, paste in the contents of `schema.sql` and run it.

### 4. Set the passcode

Project > Settings > Environment Variables > add `FRIFT_PASSCODE` with the passcode you want to share, then **redeploy** (env vars only apply to new deployments).

### 5. Point your domain at it

Vercel project > Settings > Domains > add your domain, then add the CNAME record it shows at your DNS provider (with Cloudflare, set the record to **DNS only**).

## Updating an existing deployment

When a new version adds database tables, do it in this order:

1. Run the new `schema.sql` in the Neon SQL editor first. It is safe to re-run and does not touch existing data. The old version of the app keeps working while you do this.
2. Copy the new files over your project folder (keep your `.git` folder), then `git add .`, `git commit` and `git push`. Vercel redeploys automatically.

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

- **Sets that count toward the total:** `COUNTED_SETS` in `src/lib/constants.js`.
- **Fix a mistake in a log:** open the + dialog for that exercise, pick the date, and use Delete next to the entry. You can only delete your own.
- **Rename an exercise:** in Neon, `update exercises set name = 'Romanian deadlift' where id = 'romanian_deadlift';`
- **Remove an exercise and all its entries:** in Neon, `delete from entries where exercise = 'romanian_deadlift'; delete from exercises where id = 'romanian_deadlift';`
- **Rename someone:** in Neon, `update people set name = 'Sam' where id = 2;`

## Limits worth knowing

- The "who are you" dropdown is not a login. Anyone with the passcode can log as anyone. That is fine for friends, but do not treat it as security.
- The browser loads all entries and calculates the charts itself. That is comfortable for years of data from under 10 people. If it ever feels slow, add a date filter to `GET /api/entries`.
- People are capped at 10 (`MAX_PEOPLE`), matching the 10 line colours.
- Weights are in kg.
