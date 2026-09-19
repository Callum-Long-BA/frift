// Shared by the browser and the API functions.
// The exercise list itself now lives in the database (table: exercises).

// Only the last N sets of a day count toward the total, so someone doing
// 5 sets does not look stronger than someone doing 3.
export const COUNTED_SETS = 3;

export const MAX_PEOPLE = 10;
export const MAX_EXERCISES = 20;
export const MAX_EXERCISE_NAME = 30;
export const MAX_SETS_PER_ENTRY = 10;

// What the charts can show: total weight, % change, or best single set.
export const MODES = ['total', 'pct', 'best'];

// Handed out in order as people join. Chosen to stay distinguishable on white.
export const PERSON_COLOURS = [
  '#E5322D', // red
  '#1F5FBF', // blue
  '#E6A700', // amber
  '#1E9E5A', // green
  '#7A3FD1', // violet
  '#00A3AD', // teal
  '#D6207E', // magenta
  '#6B7280', // slate
  '#8B5A2B', // brown
  '#14161A', // black
];
