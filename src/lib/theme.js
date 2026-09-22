import { PERSON_PALETTE } from './constants.js';

// A person's stored colour is the original (light-background) value. The app is dark only,
// so always show its lighter twin, which reads well on the dark panels.
export function colourFor(colour) {
  const wanted = String(colour).toLowerCase();
  const match = PERSON_PALETTE.find((c) => c.light.toLowerCase() === wanted);
  return match ? match.dark : colour;
}

// Recharts draws SVG attributes, which cannot read CSS variables, so chart chrome
// colours live here instead. Keep in step with the tokens in styles.css.
export const CHART = { grid: '#262B33', axis: '#3A414B', tick: '#A3AAB3', cursor: '#6B7280', zero: '#6B7280' };
