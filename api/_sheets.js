// Reading people's own gym spreadsheets for the daily sheet sync (api/sheet-sync.js).
// Pure functions only, so they can be tested without a network or database.
//
// Both sheets are grids: a header row of "Day 1" ... "Day 4" with the exercise names
// beside or below them, then one row per week, three set cells per exercise ("60 x 8",
// "15kg x 13"). Blank and X cells mean nothing was done.
//
// Each set cell is tracked by its position (tab, row, column). A cell the sync has not seen
// before becomes a set dated the day it is synced; the dates written in the sheet are not
// used for that. The sheet's dates only matter on the very first run, to tell what was
// already imported (see planCells).

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
    // (Only used on the first run, to recognise what was imported before.)
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
    // Each Day column holds a date (22/09/2026). Only used on the first run, as above.
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

// Everything the sheets date before this was imported once by hand (the backlog files).
export const BACKLOG_BEFORE = '2026-09-24';

// Reads one tab. `config` is an entry of SHEETS; `tab` is the tab's position in config.tabs.
// Returns every non-blank set cell from config.fromRow down, in sheet order:
//   cells: [{ key, line, name, date, text, set: { weight, reps } | null }]
//   bodyWeights: [{ key, line, date, text, kg: number | null }]   (Kyle's Weight column)
// `key` identifies the cell ('tab:row:column'); `date` is what the sheet says (null if none);
// `set` is null when the cell is not weight x reps.
export function readTab(csvText, config, tab = 0) {
  const text = String(csvText ?? '');
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // drop a byte-order mark
  const cells = [];
  const bodyWeights = [];

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
      const value = String(row[weightCol + 1] ?? '').trim();
      if (date && value) {
        const kg = KG_RE.exec(value);
        bodyWeights.push({ key: `${tab}:${line}:weight`, line, date, text: value, kg: kg ? Number(kg[1]) : null });
      }
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
          const cellText = String(row[first + k] ?? '').trim();
          const set = sheetSet(cellText);
          if (set === 'skip') continue;
          cells.push({ key: `${tab}:${line}:${first + k}`, line, name, date, text: cellText, set });
        }
      }
    }
  }
  return { cells, bodyWeights };
}

// Decides what one sync run does for one sheet, from the cells read and what the sync has
// already recorded in `seen` (Map<key, { value, entry_id, bw_date }>, the sheet_cells table).
//   newSets:        cells not seen before: add as sets dated today, in sheet order.
//   updates:        seen cells whose text changed: update the set they created.
//   remember:       cells to record without importing (see first run, below), or changed
//                   cells whose set no longer exists.
//   newBodyWeights, bwUpdates: the same for Kyle's Weight column.
//   problems, unmapped: cells that could not be imported; they are retried next run.
// First run (`seeding`, nothing seen yet): cells from the hand-imported backlog (dated before
// BACKLOG_BEFORE), and cells for a day and exercise that already has sets in FRIFT
// (`loggedDays`: 'date|exercise', from the earlier date-based sync or the app), are remembered
// as already done, so nothing is imported twice. Anything else is imported, dated today. Body
// weights likewise, with `bwDates` (days that already have a reading).
export function planCells({ cells, bodyWeights = [], seen, config, today, seeding, loggedDays = new Set(), bwDates = new Set(), exerciseIds }) {
  const plan = { newSets: [], updates: [], remember: [], newBodyWeights: [], bwUpdates: [], problems: [], unmapped: [] };
  const unmapped = new Set();
  const missing = new Set();

  for (const c of cells) {
    const mapped = config.map[c.name.toLowerCase()];
    const prior = seen.get(c.key);
    if (prior) {
      if (prior.value === c.text) continue;
      if (!c.set) plan.problems.push({ line: c.line, name: c.name, message: `"${c.text}" is not weight x reps`, format: true });
      else if (prior.entry_id && mapped) plan.updates.push({ key: c.key, entryId: prior.entry_id, weight: c.set.weight, reps: c.set.reps, value: c.text });
      else plan.remember.push({ key: c.key, value: c.text });
      continue;
    }
    if (seeding) {
      const old = !c.date || c.date < BACKLOG_BEFORE;
      const alreadyIn = mapped && c.date && loggedDays.has(`${c.date}|${mapped[0]}`);
      if (old || alreadyIn) {
        plan.remember.push({ key: c.key, value: c.text });
        continue;
      }
    }
    if (!c.set) {
      plan.problems.push({ line: c.line, name: c.name, message: `"${c.text}" is not weight x reps`, format: true });
      continue;
    }
    if (!mapped) {
      unmapped.add(c.name);
      continue;
    }
    const [exercise, equipment] = mapped;
    if (!exerciseIds.has(exercise)) {
      missing.add(exercise);
      continue;
    }
    plan.newSets.push({ key: c.key, exercise, equipment, weight: c.set.weight, reps: c.set.reps, value: c.text });
  }

  for (const b of bodyWeights) {
    const prior = seen.get(b.key);
    if (prior) {
      if (prior.value === b.text) continue;
      if (b.kg === null) plan.problems.push({ line: b.line, name: 'Weight', message: `"${b.text}" is not a weight in kg`, format: true });
      else if (prior.bw_date) plan.bwUpdates.push({ key: b.key, date: prior.bw_date, kg: b.kg, value: b.text });
      else plan.remember.push({ key: b.key, value: b.text });
      continue;
    }
    if (seeding && (!b.date || b.date < BACKLOG_BEFORE || bwDates.has(b.date))) {
      plan.remember.push({ key: b.key, value: b.text });
      continue;
    }
    if (b.kg === null) plan.problems.push({ line: b.line, name: 'Weight', message: `"${b.text}" is not a weight in kg`, format: true });
    else plan.newBodyWeights.push({ key: b.key, kg: b.kg, value: b.text });
  }

  for (const exercise of missing) plan.problems.push({ name: exercise, message: 'is not an exercise in FRIFT' });
  plan.unmapped = [...unmapped];
  return plan;
}

// One Discord line about what could not be imported, or null if there is nothing to say.
// Cells typed in the wrong format (e.g. "Do 35") are left out: they are skipped quietly,
// still listed in the sync's result, and imported once they are corrected.
export function warningMessage(person, { unmapped = [], problems: all = [], failure = null }) {
  const problems = all.filter((p) => !p.format);
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
