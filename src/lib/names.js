// Exercise names are kept in Title Case and singular: "lateral raises" -> "Lateral Raise".
// Shared by the API (which stores the tidied name) and the add exercise dialog.

// Capitalise the first letter of each word (after a space, bracket, hyphen or slash), and
// leave the rest as typed, so "RDL" stays "RDL".
export function titleCase(name) {
  return name.replace(/(^|[\s(\-/])(\p{Ll})/gu, (_, before, letter) => before + letter.toUpperCase());
}

// Drop one "s" from the end of the name, before any bracketed part: "Pull Ups" -> "Pull Up",
// "Pull Ups (Assisted)" -> "Pull Up (Assisted)". Not from "ss", "us" or "is" endings
// ("Bench Press", "Gluteus").
export function singular(name) {
  const [, main, bracket = ''] = name.match(/^(.*?)(\s*\(.*\))?$/);
  return (/[^siu]s$/i.test(main) ? main.slice(0, -1) : main) + bracket;
}

export function tidyExerciseName(name) {
  return singular(titleCase(String(name ?? '').trim().replace(/\s+/g, ' ')));
}
