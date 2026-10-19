import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, convert } from '../src/core/pipeline.js';
import { readPNG } from './helpers/png.js';

test('pixel art natif (une table de 78 × 24) : détecté, et reconverti sans perdre un pixel', () => {
  const img = readPNG(new URL('./fixtures/table-natif.png', import.meta.url).pathname);
  const { grid, background } = analyze(img);
  assert.equal(grid.period, 1);
  assert.equal(grid.native, true);
  assert.equal(background.transparent, true, 'la transparence existante fait foi : aucune couleur du bois n\'est prise pour le fond');
  const r = convert(img, { grid, background, tolerance: 60, colors: grid.colorCount, cleanup: null });
  assert.deepEqual([r.image.width, r.image.height], [img.width, img.height]);
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(r.image.data[i + 3], img.data[i + 3], `alpha du pixel ${i / 4}`);
    if (img.data[i + 3]) assert.deepEqual([...r.image.data.subarray(i, i + 3)], [...img.data.subarray(i, i + 3)], `couleur du pixel ${i / 4}`);
  }
});
