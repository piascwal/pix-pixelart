import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBackground, isBackgroundPixel } from '../src/core/background.js';
import { sampleCells } from '../src/core/sampleCells.js';
import { gridLines } from '../src/core/gridDetect.js';
import { createImage } from '../src/core/image.js';
import { fakePixelArt, px } from './helpers/synthetic.js';

const R = [230, 60, 40];
const B = [30, 90, 200];

test('fond détecté sur le bord, pas supposé #ff00ff', () => {
  const img = fakePixelArt([[R, B], [B, R]], { period: 6, offsetX: 6, offsetY: 6, noise: 5 });
  const bg = detectBackground(img);
  assert.equal(bg.transparent, false);
  assert.ok(Math.abs(bg.r - 167) <= 3 && bg.g <= 3 && Math.abs(bg.b - 132) <= 3, JSON.stringify(bg));
});

test('fond transparent reconnu', () => {
  const bg = detectBackground(createImage(10, 10));
  assert.equal(bg.transparent, true);
  assert.equal(isBackgroundPixel(new Uint8ClampedArray(4), 0, bg), true);
});

test('tolérance : somme des |écarts| RVB < 60', () => {
  const bg = { r: 167, g: 0, b: 132, transparent: false };
  const d = new Uint8ClampedArray([167 + 20, 20, 132 + 19, 255, 167 + 30, 30, 132, 255]);
  assert.equal(isBackgroundPixel(d, 0, bg), true);   // 59
  assert.equal(isBackgroundPixel(d, 4, bg), false);  // 60
});

test('médiane des pixels intérieurs : bords flous et pixel parasite ignorés', () => {
  const img = fakePixelArt([[R, B]], { period: 6, width: 12, height: 6 });
  // bord gauche de la 1re case barbouillé (ignoré : 1 px de marge)
  for (let y = 0; y < 6; y++) img.data.set([0, 255, 0], (y * 12) * 4);
  // un pixel intérieur aberrant (la médiane l'écrase)
  img.data.set([255, 255, 255], (2 * 12 + 2) * 4);
  const bg = { r: 167, g: 0, b: 132, transparent: false };
  const out = sampleCells(img, gridLines({ period: 6, offsetX: 0, offsetY: 0 }, 12, 6), bg);
  assert.equal(out.width, 2);
  assert.deepEqual(px(out, 0, 0), [...R, 255]);
  assert.deepEqual(px(out, 1, 0), [...B, 255]);
});

test('case vide si plus de la moitié de l’intérieur est du fond', () => {
  const bg = [167, 0, 132];
  const img = fakePixelArt([[R, null]], { period: 6, width: 12, height: 6, bg });
  // 2e case : 4 pixels intérieurs colorés sur 16 → vide
  for (let y = 1; y < 3; y++) for (let x = 7; x < 9; x++) img.data.set(R, (y * 12 + x) * 4);
  // 1re case : 6 pixels intérieurs de fond sur 16 → pleine, couleur = médiane des non-fond
  for (let y = 1; y < 3; y++) for (let x = 1; x < 4; x++) img.data.set(bg, (y * 12 + x) * 4);
  const out = sampleCells(img, gridLines({ period: 6, offsetX: 0, offsetY: 0 }, 12, 6),
    { r: 167, g: 0, b: 132, transparent: false });
  assert.deepEqual(px(out, 0, 0), [...R, 255]);
  assert.equal(px(out, 1, 0)[3], 0);
});
