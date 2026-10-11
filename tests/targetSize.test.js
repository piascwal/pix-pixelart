import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetGrid, gridLines } from '../src/core/gridDetect.js';
import { padToCanvas } from '../src/core/upscale.js';
import { convert } from '../src/core/pipeline.js';
import { createImage } from '../src/core/image.js';
import { rng, px } from './helpers/synthetic.js';

const NO_BG = { r: 0, g: 0, b: 0, transparent: true };

/** Image « photo » : dégradé doux + bruit, sans fond ni grille. */
function photo(w, h) {
  const img = createImage(w, h);
  const rand = rng(5);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      img.data.set([x * 255 / w, y * 255 / h, 128 + (rand() - 0.5) * 30, 255], (y * w + x) * 4);
    }
  }
  return img;
}

test('targetGrid : le côté le plus long fait la taille demandée', () => {
  assert.deepEqual(targetGrid(1408, 768, 64), { period: 22, offsetX: 0, offsetY: 0 });
  assert.equal(targetGrid(600, 800, 100).period, 8);        // portrait : la hauteur compte
  assert.equal(targetGrid(10, 10, 0).period, 10);           // taille mini 1
});

for (const [w, h, size, ew, eh] of [
  [640, 480, 64, 64, 48],      // 4:3
  [1408, 768, 64, 64, 35],     // 768 × 64 / 1408 = 34,9
  [480, 640, 32, 24, 32],      // portrait
  [1000, 1000, 48, 48, 48],    // période non entière (20,83 px)
  [4000, 3000, 128, 128, 96],
]) {
  test(`${w}×${h} → côté long ${size} : ${ew}×${eh} pixels`, () => {
    const grid = targetGrid(w, h, size);
    const { xs, ys } = gridLines(grid, w, h);
    assert.equal(xs.length - 1, ew);
    assert.equal(ys.length - 1, eh);
  });
}

test('photo : sortie pleine, à la taille demandée, sans fond retiré', () => {
  const img = photo(640, 480);
  const r = convert(img, { grid: targetGrid(640, 480, 64), background: NO_BG, colors: 24 });
  assert.equal(r.image.width, 64);
  assert.equal(r.image.height, 48);
  assert.equal(r.stats.filled, 64 * 48);          // aucune case vidée
  assert.ok(r.palette.length <= 24);
});

test('photo : chaque pixel est proche de la couleur moyenne de son bloc', () => {
  const img = photo(320, 320);
  const r = convert(img, { grid: targetGrid(320, 320, 16), background: NO_BG, colors: 256, cleanup: null });
  // bloc (3, 5) : 20 px de côté, l'intérieur sert à la médiane
  const x0 = 3 * 20, y0 = 5 * 20;
  let sr = 0, sg = 0, n = 0;
  for (let y = y0 + 1; y < y0 + 19; y++) for (let x = x0 + 1; x < x0 + 19; x++) {
    const i = (y * 320 + x) * 4; sr += img.data[i]; sg += img.data[i + 1]; n++;
  }
  const got = px(r.image, 3, 5);
  assert.ok(Math.abs(got[0] - sr / n) < 12, `rouge ${got[0]} vs ${sr / n}`);
  assert.ok(Math.abs(got[1] - sg / n) < 12, `vert ${got[1]} vs ${sg / n}`);
});

test('même image avec retrait du fond : un fond uni disparaît', () => {
  const img = createImage(200, 100);
  img.data.fill(255);
  for (let y = 25; y < 75; y++) for (let x = 50; x < 150; x++) img.data.set([200, 30, 30, 255], (y * 200 + x) * 4);
  const keep = convert(img, { grid: targetGrid(200, 100, 20), background: NO_BG, trim: false });
  assert.equal(keep.stats.filled, 20 * 10);
  const bg = { r: 255, g: 255, b: 255, transparent: false };
  const cut = convert(img, { grid: targetGrid(200, 100, 20), background: bg });
  assert.ok(cut.stats.filled < 20 * 10);
  assert.equal(cut.image.width, 10);   // rogné autour du sprite
});

test('toile carrée : image centrée, sans perte', () => {
  const img = createImage(3, 2);
  for (let i = 0; i < 6; i++) img.data.set([i + 1, 0, 0, 255], i * 4);
  const out = padToCanvas(img, 6);
  assert.deepEqual([out.width, out.height], [6, 6]);
  // marge : (6-3)>>1 = 1 à gauche, (6-2)>>1 = 2 en haut
  assert.deepEqual(px(out, 1, 2), [1, 0, 0, 255]);
  assert.deepEqual(px(out, 3, 3), [6, 0, 0, 255]);
  assert.equal(px(out, 0, 0)[3], 0);
  assert.equal(px(out, 5, 5)[3], 0);
  let filled = 0;
  for (let i = 3; i < out.data.length; i += 4) if (out.data[i]) filled++;
  assert.equal(filled, 6);
});

test('toile trop petite : erreur claire', () => {
  assert.throws(() => padToCanvas(createImage(10, 4), 8), RangeError);
});
