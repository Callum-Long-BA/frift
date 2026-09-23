// Shared by the browser and the API functions.
// The exercise list itself now lives in the database (table: exercises).

// Only the last N sets of a day count toward the total, so someone doing
// 5 sets does not look stronger than someone doing 3.
export const COUNTED_SETS = 3;

export const MAX_PEOPLE = 10;
export const MAX_EXERCISES = 20;
export const MAX_EXERCISE_NAME = 30;
export const MAX_SETS_PER_ENTRY = 10;

// How a set was lifted, for exercises that allow a choice. Dumbbell weights are
// entered per dumbbell, so the "Equalise" option doubles them to compare with a barbell.
export const EQUIPMENT = ['barbell', 'dumbbell'];

// Kinds of exercise people can add from the app: weight x reps, or reps only (e.g. pull-ups).
// 'cardio' also exists, but only the built-in Cardio exercise uses it.
export const ADDABLE_KINDS = ['strength', 'reps'];

// What the charts can show: total weight, % change, best single set, or best set as a
// multiple of body weight.
export const MODES = ['total', 'pct', 'best', 'bw'];

// Weight limits for one set. Below zero is an assisted set: the assistance, as minus kg.
export const MIN_WEIGHT = -500;
export const MAX_WEIGHT = 1000;

// The Running tile's run types. Easy charts distance; tempo and intervals chart pace.
export const RUN_TYPES = ['easy', 'tempo', 'intervals'];
export const RUN_TYPE_LABELS = { easy: 'Easy', tempo: 'Tempo', intervals: 'Intervals' };

// Tempo runs are charted for one distance at a time. A run counts as 5K or 10K if it is
// within 5% of it; "All" shows every tempo run.
export const TEMPO_DISTANCES = [
  { key: '5k', label: '5K', km: 5 },
  { key: '10k', label: '10K', km: 10 },
  { key: 'all', label: 'All', km: null },
];
export const MAX_RUN_KM = 200;
export const MAX_RUN_SECONDS = 24 * 60 * 60;

// Handed out in order as people join. The `light` value is what gets stored against a
// person in the database; `dark` is the lighter twin actually shown, since the app is dark
// only (so the old "black" stays visible).
export const PERSON_PALETTE = [
  { name: 'red', light: '#E5322D', dark: '#FF5C57' },
  { name: 'blue', light: '#1F5FBF', dark: '#5B9BFF' },
  { name: 'amber', light: '#E6A700', dark: '#FFC53D' },
  { name: 'green', light: '#1E9E5A', dark: '#3DD68C' },
  { name: 'violet', light: '#7A3FD1', dark: '#A78BFA' },
  { name: 'teal', light: '#00A3AD', dark: '#22D3EE' },
  { name: 'magenta', light: '#D6207E', dark: '#E879F9' },
  { name: 'slate', light: '#6B7280', dark: '#9CA3AF' },
  { name: 'brown', light: '#8B5A2B', dark: '#C79A66' },
  { name: 'black', light: '#14161A', dark: '#F3F4F6' },
];

// What the API stores. Unchanged for the database: still the original (light) values.
export const PERSON_COLOURS = PERSON_PALETTE.map((c) => c.light);

// The activity strip shows this many weeks, Monday to Sunday, ending with the current week.
export const ACTIVITY_WEEKS = 3;
