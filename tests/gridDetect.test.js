import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGrid, gridLines, gradientEnergy, integerPeriod } from '../src/core/gridDetect.js';
import { fakePixelArt, randomSprite } from './helpers/synthetic.js';

for (const period of [3, 4, 6, 8, 11, 16]) {
  test(`période ${period} px retrouvée`, () => {
    const img = fakePixelArt(randomSprite(24, 18), { period, offsetX: 2, offsetY: 1, noise: 6 });
    const grid = detectGrid(img);
    assert.ok(Math.abs(grid.period - period) < 0.1, `trouvé ${grid.period}`);
  });
}

test('prend la plus petite période forte, pas un multiple', () => {
  const img = fakePixelArt(randomSprite(40, 30), { period: 6 });
  const { period, peaks } = integerPeriod(gradientEnergy(img));
  assert.equal(period, 6);
  assert.ok(peaks.some((p) => p.period === 12), 'les multiples ressortent aussi');
});

test('période fractionnaire (5,5 px) affinée', () => {
  const img = fakePixelArt(randomSprite(60, 40), { period: 5.5, noise: 4 });
  const grid = detectGrid(img);
  assert.ok(Math.abs(grid.period - 5.5) < 0.05, `trouvé ${grid.period}`);
});

test('décalage de la grille retrouvé', () => {
  const img = fakePixelArt(randomSprite(30, 20), { period: 8, offsetX: 3, offsetY: 5, noise: 4 });
  const grid = detectGrid(img);
  assert.equal(grid.period, 8);
  assert.ok(Math.abs(grid.offsetX - 3) <= 0.5, `offsetX ${grid.offsetX}`);
  assert.ok(Math.abs(grid.offsetY - 5) <= 0.5, `offsetY ${grid.offsetY}`);
});

test('image unie : pas de grille, confiance nulle', () => {
  const img = fakePixelArt([[null]], { width: 50, height: 50 });
  const grid = detectGrid(img);
  assert.equal(grid.confidence, 0);
});

test('gridLines : cases contiguës, cases partielles < ½ ignorées', () => {
  const { xs, ys } = gridLines({ period: 6, offsetX: 2, offsetY: 4 }, 20, 12);
  // colonnes : [0,2) trop petite, [2,8) [8,14) [14,20)
  assert.deepEqual(xs, [2, 8, 14, 20]);
  // lignes : [0,4) gardée (4 ≥ 3), [4,10), [10,12) trop petite
  assert.deepEqual(ys, [0, 4, 10]);
});

test('une taille de case absurde (champ vidé, 0, NaN, trop petite) est refusée au lieu de planter', async () => {
  const { gridLines } = await import('../src/core/gridDetect.js');
  for (const period of [0, -3, NaN, 0.01]) {
    assert.throws(() => gridLines({ period, offsetX: 0, offsetY: 0 }, 400, 300), RangeError, String(period));
  }
  assert.throws(() => gridLines({ period: 8, offsetX: NaN, offsetY: 0 }, 400, 300), RangeError);
  assert.equal(gridLines({ period: 8, offsetX: 0, offsetY: 0 }, 400, 300).xs.length, 51);
});

test('pixel art déjà en pixels réels : reconnu (1 px par case) ; agrandi ou bruité : non', async () => {
  const { nativePixelArt } = await import('../src/core/gridDetect.js');
  const { createImage } = await import('../src/core/image.js');
  const natif = createImage(40, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 40; x++) {
    const c = (x * 7 + y * 3) % 5 < 2 ? [150, 90, 40] : (x + y) % 3 ? [110, 60, 30] : [200, 140, 80];
    natif.data.set([...c, 255], (y * 40 + x) * 4);
  }
  assert.equal(nativePixelArt(natif), 3);
  assert.equal(detectGrid(natif).period, 1);
  assert.equal(detectGrid(natif).native, true);
  // le même agrandi ×4 : pas du natif (la détection ordinaire reprend la main)
  const grand = createImage(160, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 160; x++) grand.data.set(natif.data.subarray(((y >> 2) * 40 + (x >> 2)) * 4, ((y >> 2) * 40 + (x >> 2)) * 4 + 4), (y * 160 + x) * 4);
  assert.equal(nativePixelArt(grand), null);
  // bruité : des centaines de couleurs
  const bruit = createImage(40, 16);
  for (let i = 0; i < 40 * 16; i++) bruit.data.set([(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255], i * 4);
  assert.equal(nativePixelArt(bruit), null);
});
