// Shared by the browser and the API functions.
// The exercise list itself now lives in the database (table: exercises).

export const MAX_PEOPLE = 10;
export const MAX_EXERCISES = 40;
export const MAX_EXERCISE_NAME = 30;
export const MAX_SETS_PER_ENTRY = 10;

// How a set was lifted, for exercises that allow a choice. Dumbbell weights are
// entered per dumbbell, so the "Equalise" option doubles them to compare with a barbell.
export const EQUIPMENT = ['barbell', 'dumbbell', 'cable'];
export const EQUIPMENT_LABELS = { barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable' };

// The equipment one exercise can be logged with, in the order offered: its own list if it
// has one, else barbell or dumbbell for the older yes/no choice, else none.
export function equipmentOptions(exercise) {
  if (exercise?.kind !== 'strength') return [];
  if (exercise.equipment_options?.length > 1) return exercise.equipment_options;
  return exercise.equipment_choice ? ['barbell', 'dumbbell'] : [];
}

// A short tag after a set: "60×8 DB", "20×12 cable". Barbell (or nothing recorded) has none.
export const equipmentTag = (equipment) => (equipment === 'dumbbell' ? ' DB' : equipment === 'cable' ? ' cable' : '');

// Weights may have up to 2 decimal places (1.25 kg plates).
export const WEIGHT_STEP = 0.01;

// Kinds of exercise people can add from the app: weight x reps, or reps only (e.g. pull-ups).
// 'cardio' also exists, but only the built-in Cardio exercise uses it.
export const ADDABLE_KINDS = ['strength', 'reps'];

// Muscle groups for the Weight training quick filters, in the order the buttons appear.
// Weight exercises pick one when they are added; any without one show under "Other".
export const MUSCLE_GROUPS = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'legs', label: 'Legs' },
];

// What the Cardio tile can chart, from each session's speed, incline and minutes.
export const CARDIO_VIEWS = [
  { key: 'distance', label: 'Distance', subtitle: 'Distance per day (speed × time), km' },
  { key: 'time', label: 'Time', subtitle: 'Minutes per day' },
  { key: 'speed', label: 'Speed', subtitle: 'Average speed per day, km/h' },
  { key: 'incline', label: 'Incline', subtitle: 'Average incline per day, %' },
  { key: 'climb', label: 'Climb', subtitle: 'Height climbed per day (distance × incline), m' },
];

// What the charts can show: total weight, % change, best single set, or best set as a
// multiple of body weight.
export const MODES = ['total', 'pct', 'best', 'bw'];

// Weight limits for one set. Below zero is an assisted set: the assistance, as minus kg.
export const MIN_WEIGHT = -500;
export const MAX_WEIGHT = 1000;

// The Running tile's run types. Easy charts distance; the rest chart pace. VO2 max sessions,
// hills and intervals are logged as several reps (one row each, rest not included).
// Swimming only has the first three.
export const RUN_TYPES = ['easy', 'tempo', 'intervals', 'vo2max', 'hills'];
export const RUN_TYPE_LABELS = { easy: 'Easy', tempo: 'Tempo', intervals: 'Intervals', vo2max: 'VO2 max session', hills: 'Hills' };
export const MULTI_RUN_TYPES = ['intervals', 'vo2max', 'hills'];
export const runTypesFor = (exerciseId) => (exerciseId === 'swimming' ? ['easy', 'tempo', 'intervals'] : RUN_TYPES);
// What one row of a multi-row run is called: "Interval 2", "Rep 2", "Hill 2".
export const RUN_ROW_LABELS = { intervals: 'Interval', vo2max: 'Rep', hills: 'Hill' };

// Pace is per km for running, per 100 m for swimming. `km` is the distance one pace covers.
export const paceUnitFor = (exerciseId) => (exerciseId === 'swimming' ? { km: 0.1, label: '/100m' } : { km: 1, label: '/km' });

// VO2 max scores (ml/kg/min, as a watch estimates it), logged on the Running tile.
export const MIN_VO2MAX = 10;
export const MAX_VO2MAX = 100;

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

// How much of the timeline a chart shows. Tiles show the last 8 weeks (this week and the
// 7 before it); the expanded view starts on "All" and can be narrowed with these.
export const CHART_RANGES = [
  { key: '8w', label: '8W', title: 'Last 8 weeks' },
  { key: '3m', label: '3M', title: 'Last 3 months' },
  { key: '6m', label: '6M', title: 'Last 6 months' },
  { key: '1y', label: '1Y', title: 'Last year' },
  { key: 'all', label: 'All', title: 'Everything' },
];
export const TILE_RANGE = '8w';

// The activity strip shows this many weeks, Monday to Sunday, ending with the current week.
export const ACTIVITY_WEEKS = 3;
