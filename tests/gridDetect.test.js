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
