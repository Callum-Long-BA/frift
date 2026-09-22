// Reading the Google Sheet that entries are imported from. Pure functions only, so they
// can be tested without a network or database. The endpoint is api/import-sheet.js.
//
// The sheet has a header row, then one row per set (or one row per cardio session):
//
//   Date       | Name | Exercise    | Weight | Reps | Minutes | Equipment
//   22/09/2026 | Sam  | Bench press | 60     | 8    |         | barbell
//   22/09/2026 | Sam  | Pull ups    |        | 12   |         |
//   22/09/2026 | Jo   | Cardio      |        |      | 30      |
//
// Headers are matched ignoring case, and a few alternatives are accepted (see COLUMNS).
// Column order does not matter and extra columns are ignored. A Google Form's
// "Timestamp" column is used for the date when there is no Date column.

const COLUMNS = {
  date: ['date', 'day'],
  timestamp: ['timestamp'],
  name: ['name', 'person', 'who'],
  exercise: ['exercise'],
  weight: ['weight', 'weight (kg)', 'kg'],
  reps: ['reps'],
  minutes: ['minutes', 'mins', 'duration', 'duration (min)', 'duration (mins)'],
  equipment: ['equipment'],
};

// A small RFC 4180 CSV parser: handles quoted fields, "" inside quotes, and CRLF.
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
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Accepts 2026-09-22, 22/09/2026 and 22/9/26 (day first, as a UK sheet shows it),
// optionally followed by a time. Returns 'YYYY-MM-DD', or null if it cannot be read.
export function normaliseDate(value) {
  const text = String(value ?? '').trim().split(/[ T]/)[0];
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Turns the CSV into { rows, errors }. Each row is
//   { line, date, name, exercise, weight, reps, minutes, equipment, fingerprint }
// with blanks as ''. `line` is the sheet row number, for error messages.
//
// `fingerprint` identifies the row by its content, so re-reading the sheet does not log
// it twice even if rows above it are inserted or sorted. Identical rows (three sets of
// 60 x 8 on the same day) are told apart by counting them: #1, #2, #3.
export function readSheet(csvText) {
  const table = parseCsv(String(csvText ?? '').replace(/^﻿/, ''));
  const errors = [];
  if (table.length === 0) return { rows: [], errors: ['The sheet is empty.'] };

  const headers = table[0].map((h) => h.trim().toLowerCase());
  const index = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    index[key] = headers.findIndex((h) => names.includes(h));
  }
  const missing = ['name', 'exercise'].filter((k) => index[k] === -1);
  if (index.date === -1 && index.timestamp === -1) missing.unshift('date');
  if (missing.length > 0) {
    return { rows: [], errors: [`The sheet's header row is missing: ${missing.join(', ')}.`] };
  }

  const seen = new Map();
  const rows = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (key) => (index[key] === -1 ? '' : String(cells[index[key]] ?? '').trim());
    if (cells.every((c) => String(c).trim() === '')) return;

    const rawDate = index.date === -1 ? get('timestamp') : get('date');
    const date = normaliseDate(rawDate);
    if (!date) {
      errors.push(`Row ${line}: cannot read the date "${rawDate}". Use 22/09/2026 or 2026-09-22.`);
      return;
    }

    const row = {
      line,
      date,
      name: get('name').replace(/\s+/g, ' '),
      exercise: get('exercise').replace(/\s+/g, ' '),
      weight: get('weight'),
      reps: get('reps'),
      minutes: get('minutes'),
      equipment: get('equipment').toLowerCase(),
    };
    const content = [row.date, row.name.toLowerCase(), row.exercise.toLowerCase(), row.weight, row.reps, row.minutes, row.equipment].join('|');
    const n = (seen.get(content) ?? 0) + 1;
    seen.set(content, n);
    row.fingerprint = `${content}#${n}`;
    rows.push(row);
  });
  return { rows, errors };
}
