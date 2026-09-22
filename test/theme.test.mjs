import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSON_COLOURS, PERSON_PALETTE } from '../src/lib/constants.js';
import { CHART, colourFor } from '../src/lib/theme.js';

test('the API still stores the light colours, so existing rows keep matching', () => {
  assert.deepEqual(PERSON_COLOURS, PERSON_PALETTE.map((c) => c.light));
  assert.equal(PERSON_COLOURS.length, 10);
  assert.equal(PERSON_COLOURS[0], '#E5322D');
});

test('light theme shows the stored colour unchanged', () => {
  for (const c of PERSON_COLOURS) assert.equal(colourFor(c, 'light'), c);
});

test('dark theme swaps each stored colour for its lighter twin, ignoring case', () => {
  assert.equal(colourFor('#E5322D', 'dark'), '#FF5C57');
  assert.equal(colourFor('#e5322d', 'dark'), '#FF5C57');
  assert.equal(colourFor('#14161A', 'dark'), '#F3F4F6'); // the old black must not vanish on a dark page
});

test('an unknown colour passes through untouched', () => {
  assert.equal(colourFor('#123456', 'dark'), '#123456');
});

test('every dark twin is distinct, and bright enough to read on the dark panel', () => {
  const darks = PERSON_PALETTE.map((c) => c.dark.toLowerCase());
  assert.equal(new Set(darks).size, darks.length);
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const panel = lum('#16191E');
  for (const { name, dark } of PERSON_PALETTE) {
    const ratio = (lum(dark) + 0.05) / (panel + 0.05);
    assert.ok(ratio >= 4.5, `${name} dark twin contrast ${ratio.toFixed(2)} is below 4.5`);
  }
});

test('both themes define every chart colour', () => {
  assert.deepEqual(Object.keys(CHART.dark).sort(), Object.keys(CHART.light).sort());
});
