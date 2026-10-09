import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorHistogram, medianCut, applyPalette, nearestIndex, usedColors } from '../src/core/palette.js';
import { createImage } from '../src/core/image.js';

function imageOf(colors) {
  const img = createImage(colors.length, 1);
  colors.forEach((c, i) => img.data.set([...c, 255], i * 4));
  return img;
}

test('peu de couleurs : palette = couleurs exactes', () => {
  const img = imageOf([[1, 2, 3], [200, 10, 10], [1, 2, 3]]);
  const pal = medianCut(colorHistogram(img), 8);
  assert.deepEqual(pal, [[1, 2, 3], [200, 10, 10]]);
});

test('réduit au nombre demandé, sans perdre une teinte minoritaire franche', () => {
  const colors = [];
  // beaucoup de nuances de gris…
  for (let v = 0; v < 250; v++) colors.push([v, v, v], [v, v, v]);
  // …et un petit bleu
  for (let k = 0; k < 6; k++) colors.push([20, 80, 210 + k]);
  const img = imageOf(colors);
  const pal = medianCut(colorHistogram(img), 12);
  assert.ok(pal.length <= 12);
  const out = applyPalette(img, pal);
  assert.ok(usedColors(out).length <= 12);
  const blue = pal[nearestIndex(pal, 20, 80, 212)];
  assert.ok(blue[2] - blue[0] > 120, `le bleu doit survivre : ${blue}`);
});

test('applyPalette garde la transparence et ne trame pas', () => {
  const img = imageOf([[10, 10, 10], [12, 12, 12], [240, 240, 240]]);
  img.data[3 + 8] = 0; // 3e pixel transparent
  const out = applyPalette(img, [[11, 11, 11], [250, 250, 250]]);
  assert.deepEqual([...out.data.subarray(0, 8)], [11, 11, 11, 255, 11, 11, 11, 255]);
  assert.equal(out.data[11], 0);
});
