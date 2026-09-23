// Reading people's own gym spreadsheets for the daily sheet sync (api/sheet-sync.js).
// Pure functions only, so they can be tested without a network or database.
//
// Both sheets are grids: a header row of "Day 1" ... "Day 4" with the exercise names
// beside or below them, then one row per week, three set cells per exercise ("60 x 8",
// "15kg x 13"). Blank and X cells mean nothing was done.

// Sets are only read for this date onwards; everything earlier was imported by hand.
export const START_DATE = '2026-09-24';

// One entry per sheet. `idEnv` names the environment variable holding the Google Sheet's id
// (the long part of its URL), so the ids are not in the code. The sheet must be shared as
// "Anyone with the link: Viewer". `map` turns the sheet's exercise names (compared in
// lower case) into [FRIFT exercise id, equipment or null].
export const SHEETS = [
  {
    key: 'kenneth',
    person: 'Kenneth',
    idEnv: 'KENNETH_SHEET_ID',
    tabs: [{ sheet: '2026 Gym Progression' }, { sheet: '2026 Gym Progression - 2' }],
    // Rows are "Week N"; Week 10 is w/c Mon 21 Sep 2026. Day 1-4 are Mon, Tue, Thu, Fri.
    dates: { type: 'weeks', anchorWeek: 10, anchorMonday: '2026-09-21', dayOffsets: { 1: 0, 2: 1, 3: 3, 4: 4 } },
    fromRow: 1,
    map: {
      'tricep push down': ['tricep_pushdown', null],
      'tricep pushdown': ['tricep_pushdown', null],
      'rear delts': ['rear_delts', null],
      'dumbbell press': ['bench_press', 'dumbbell'],
      'incline dumbbell press': ['incline_dumbbell_press', null],
      'lat raises': ['lateral_raise', null],
      'lat pulldowns': ['lat_pulldown', null],
      'seated row': ['seated_row', null],
      'seated incline curls': ['incline_db_curl', null],
      'leg extensions': ['leg_extension', null],
      'hamstring curls': ['hamstring_curl', null],
      'overhead extensions': ['overhead_extension', null],
      'chest fly': ['chest_fly', null],
      'chest press': ['machine_chest_press', null],
      'shoulder press': ['machine_shoulder_press', null],
      'cable curl': ['cable_curl', null],
      'hammer curls': ['hammer_curl', null],
      'calf raises': ['calf_raise', null],
    },
  },
  {
    key: 'kyle',
    person: 'Kyle',
    idEnv: 'KYLE_SHEET_ID',
    tabs: [{ gid: '0' }],
    // Each Day column holds the date that session was done (22/09/2026).
    dates: { type: 'dated' },
    fromRow: 9,
    // A "Weight" column of date and "96.6kg" pairs: body weight.
    bodyWeight: true,
    map: {
      'dumbbell bench press': ['bench_press', 'dumbbell'],
      'incline press': ['incline_dumbbell_press', null],
      'tricep pushdown': ['tricep_pushdown', null],
      'tricep pushown': ['tricep_pushdown', null],
      'rear delt fly': ['rear_delts', null],
      'side raises': ['lateral_raise', null],
      deadlift: ['deadlift', null],
      'lat pulldown': ['lat_pulldown', null],
      'leg extension': ['leg_extension', null],
      'hamstring curls': ['hamstring_curl', null],
      'seated incline curl': ['incline_db_curl', null],
      'machine shoulder press': ['machine_shoulder_press', null],
      'machine chest press': ['machine_chest_press', null],
      'machine chest fly': ['chest_fly', null],
      'tricep overhead extension': ['overhead_extension', null],
      squat: ['squat', 'barbell'],
      'cable row': ['seated_row', null],
      'cable curls': ['cable_curl', null],
      'hammer curl': ['hammer_curl', null],
      'calf raises': ['calf_raise', null],
    },
  },
];

// The CSV address for one tab of a sheet shared "Anyone with the link".
export function tabCsvUrl(sheetId, tab) {
  const base = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}`;
  return tab.gid !== undefined
    ? `${base}/export?format=csv&gid=${encodeURIComponent(tab.gid)}`
    : `${base}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab.sheet)}`;
}

// A small RFC 4180 CSV parser: quoted fields, "" inside quotes, CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DAY_RE = /^\s*Day\s*(\d+)\s*$/i;
const SET_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*[x×]\s*(\d+)\s*$/i;
const DATE_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
const KG_RE = /^\s*(\d+(?:\.\d+)?)\s*kg\s*$/i;
const WEEK_RE = /^\s*Week\s*(\d+)\s*$/i;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// "22/09/2026" (day first) -> '2026-09-22', or null.
export function sheetDate(text) {
  const m = DATE_RE.exec(String(text ?? ''));
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

// "60 x 8", "13.25 x 12", "15kg x 13", "12.5kg x9" -> { weight, reps }; blank or X -> 'skip';
// anything else -> null.
export function sheetSet(text) {
  const t = String(text ?? '').trim();
  if (t === '' || t.toLowerCase() === 'x') return 'skip';
  const m = SET_RE.exec(t);
  return m ? { weight: Number(m[1]), reps: Number(m[2]) } : null;
}

const isNameCell = (cell) => {
  const t = String(cell ?? '').trim();
  return t !== '' && !DAY_RE.test(t) && !sheetDate(t) && !KG_RE.test(t) && t.toLowerCase() !== 'weight';
};

// Reads one tab. `config` is an entry of SHEETS. Returns
//   { sets: [{ date, name, cell, weight, reps, line }], bodyWeights: [{ date, kg, line }], problems }
// covering every row from config.fromRow down (the caller filters by date). `sets` are in
// cell order, so an exercise's sets on a day stay in the order they were written.
export function readTab(csvText, config) {
  const text = String(csvText ?? '');
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // drop a byte-order mark
  const sets = [];
  const bodyWeights = [];
  const problems = [];

  // The body weight column is found by its "Weight" heading anywhere in the sheet.
  let weightCol = -1;
  if (config.bodyWeight) {
    for (const row of rows) {
      const c = row.findIndex((cell) => cell.trim().toLowerCase() === 'weight');
      if (c !== -1) {
        weightCol = c;
        break;
      }
    }
  }

  let layout = null; // [{ day, col, exercises: [{ col, name }] }]
  for (let r = config.fromRow - 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;

    if (weightCol !== -1) {
      const date = sheetDate(row[weightCol]);
      const kg = KG_RE.exec(row[weightCol + 1] ?? '');
      if (date && kg) bodyWeights.push({ date, kg: Number(kg[1]), line });
    }

    const dayCols = row.map((cell, c) => [c, DAY_RE.exec(cell)]).filter(([, m]) => m);
    if (dayCols.length > 0) {
      // A header. Exercise names are beside the Day cells (Kyle) or in the row below (Kenneth).
      const lastCol = weightCol === -1 ? row.length : weightCol;
      const namesInRow = row.slice(dayCols[0][0], lastCol).some(isNameCell);
      const names = namesInRow ? row : rows[r + 1] ?? [];
      layout = dayCols.map(([col, m], i) => {
        const end = i + 1 < dayCols.length ? dayCols[i + 1][0] : lastCol;
        const exercises = [];
        for (let c = col; c < end; c++) {
          if (isNameCell(names[c])) exercises.push({ col: c, name: names[c].trim().replace(/\s+/g, ' ') });
        }
        return { day: Number(m[1]), col, exercises };
      });
      if (!namesInRow) r++; // the names row is part of the header
      continue;
    }
    if (!layout) continue;

    for (const { day, col, exercises } of layout) {
      let date = null;
      if (config.dates.type === 'weeks') {
        const week = WEEK_RE.exec(row[0] ?? '');
        const offset = config.dates.dayOffsets[day];
        if (week && offset !== undefined) {
          date = addDays(config.dates.anchorMonday, (Number(week[1]) - config.dates.anchorWeek) * 7 + offset);
        }
      } else {
        date = sheetDate(row[col]);
      }
      for (const { col: first, name } of exercises) {
        for (let k = 0; k < 3; k++) {
          const cell = row[first + k] ?? '';
          const set = sheetSet(cell);
          if (set === 'skip') continue;
          if (!date) {
            problems.push({ line, name, cell, message: `has "${cell}" but no date` });
            continue;
          }
          if (!set) {
            problems.push({ date, line, name, cell, message: `"${cell}" is not weight x reps` });
            continue;
          }
          sets.push({ date, name, cell: k + 1, weight: set.weight, reps: set.reps, line });
        }
      }
    }
  }
  return { sets, bodyWeights, problems };
}

// Groups sets into sessions for FRIFT: Map<'date|exerciseId', { date, exercise, equipment,
// sets: [{ weight, reps }] }>, keeping only dates from START_DATE to `today`. Names not in
// config.map are returned in `unmapped`.
export function sheetSessions(sets, config, today) {
  const sessions = new Map();
  const unmapped = new Set();
  for (const s of sets) {
    if (s.date < START_DATE || s.date > today) continue;
    const mapped = config.map[s.name.toLowerCase()];
    if (!mapped) {
      unmapped.add(s.name);
      continue;
    }
    const [exercise, equipment] = mapped;
    const key = `${s.date}|${exercise}`;
    if (!sessions.has(key)) sessions.set(key, { date: s.date, exercise, equipment, sets: [] });
    sessions.get(key).sets.push({ weight: s.weight, reps: s.reps });
  }
  return { sessions, unmapped: [...unmapped] };
}

// What to do for each sheet session, given the person's existing entries from START_DATE
// on ([{ exercise, date, set_number, weight, reps, equipment, source }]). The sheet wins
// for sessions that came from the sheet; anything logged in the app is never touched.
//   add:       nothing logged yet for that exercise and day.
//   replace:   only sheet sets there, and the sheet has changed.
//   unchanged: only sheet sets there, and they match.
//   app:       something was logged in the app for that exercise and day, so leave it.
export function planSync(sessions, existing) {
  const byKey = new Map();
  for (const e of existing) {
    const key = `${e.date}|${e.exercise}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  const plan = { add: [], replace: [], unchanged: [], app: [] };
  for (const [key, session] of sessions) {
    const rows = (byKey.get(key) ?? []).sort((a, b) => a.set_number - b.set_number);
    if (rows.length === 0) plan.add.push(session);
    else if (rows.some((r) => r.source !== 'sheet')) plan.app.push(session);
    else if (
      rows.length === session.sets.length &&
      rows.every((r, i) => r.weight === session.sets[i].weight && r.reps === session.sets[i].reps && (r.equipment ?? null) === session.equipment)
    ) {
      plan.unchanged.push(session);
    } else plan.replace.push(session);
  }
  return plan;
}

// One Discord line about what could not be imported, or null if there is nothing to say.
export function warningMessage(person, { unmapped = [], problems = [], failure = null }) {
  const parts = [];
  if (failure) parts.push(failure);
  if (unmapped.length > 0) {
    parts.push(`not sure which FRIFT exercise ${unmapped.map((n) => `"${n}"`).join(', ')} ${unmapped.length === 1 ? 'is' : 'are'}, so ${unmapped.length === 1 ? 'it was' : 'they were'} skipped`);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 3).map((p) => `${p.line ? `row ${p.line} ` : ''}${p.name} ${p.message}`);
    parts.push(`skipped ${shown.join('; ')}${problems.length > 3 ? ` and ${problems.length - 3} more` : ''}`);
  }
  return parts.length > 0 ? `⚠️ FRIFT sheet sync for ${person}: ${parts.join('. ')}.` : null;
}
