// Shared by the browser and the API functions.
// To add an exercise, add one line here. No database change is needed.
export const EXERCISES = [
  { id: 'bench_press', name: 'Bench press', kind: 'strength' },
  { id: 'lat_pulldown', name: 'Lat pull down', kind: 'strength' },
  { id: 'squat', name: 'Squat', kind: 'strength' },
  { id: 'leg_extension', name: 'Leg extension', kind: 'strength' },
  { id: 'shoulder_press', name: 'Shoulder press', kind: 'strength' },
  { id: 'incline_db_curl', name: 'Incline dumbbell curl', kind: 'strength' },
  { id: 'cardio', name: 'Cardio', kind: 'cardio' },
];

// Only the last N sets of a day count toward the chart, so someone doing
// 5 sets does not look stronger than someone doing 3.
export const COUNTED_SETS = 3;

export const MAX_PEOPLE = 10;
export const MAX_SETS_PER_ENTRY = 10;

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
