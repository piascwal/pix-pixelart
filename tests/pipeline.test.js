import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depix } from '../src/core/pipeline.js';
import { fakePixelArt, randomSprite, px } from './helpers/synthetic.js';

test('aller-retour : un faux pixel art redonne exactement le sprite', () => {
  const sprite = randomSprite(20, 14);
  const img = fakePixelArt(sprite, { period: 7, offsetX: 11, offsetY: 9, noise: 8 });
  const r = depix(img, { cleanup: null, colors: 6 });
  assert.equal(r.image.width, 20);
  assert.equal(r.image.height, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 20; x++) {
      const got = px(r.image, x, y);
      sprite[y][x].forEach((v, c) => assert.ok(Math.abs(got[c] - v) <= 3, `case ${x},${y}`));
    }
  }
  // les bords renvoyés pointent bien sur les cases de l'image source
  assert.equal(r.lines.xs.length, 21);
  assert.ok(Math.abs(r.lines.xs[0] - 11) <= 1);
});

test('réglages manuels prioritaires sur la détection', () => {
  const img = fakePixelArt(randomSprite(10, 10), { period: 6 });
  const r = depix(img, { period: 12, offsetX: 0, offsetY: 0, cleanup: null });
  assert.equal(r.image.width, 5);
});
