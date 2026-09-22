import { PERSON_PALETTE } from './constants.js';

export const THEMES = ['dark', 'light'];
export const THEME_KEY = 'frift.theme';

// A person's stored colour is always the light value. On the dark theme, swap in its twin.
export function colourFor(colour, theme) {
  if (theme !== 'dark') return colour;
  const wanted = String(colour).toLowerCase();
  const match = PERSON_PALETTE.find((c) => c.light.toLowerCase() === wanted);
  return match ? match.dark : colour;
}

// Recharts draws SVG attributes, which cannot read CSS variables, so chart chrome
// colours live here instead. Keep in step with the tokens in styles.css.
export const CHART = {
  dark: { grid: '#262B33', axis: '#3A414B', tick: '#A3AAB3', cursor: '#6B7280', zero: '#6B7280', ring: '#16191E' },
  light: { grid: '#E4E7EA', axis: '#C9CED3', tick: '#5B636D', cursor: '#9AA1A9', zero: '#9AA1A9', ring: '#FFFFFF' },
};
