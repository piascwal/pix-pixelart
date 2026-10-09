import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeIsolated, removeSmallIslands, fillPinholes, cleanup } from '../src/core/cleanup.js';
import { upscale, flatten } from '../src/core/upscale.js';
import { createImage, trimTransparent } from '../src/core/image.js';

/** Image depuis un dessin ASCII : '#' rouge, 'b' bleu, '.' transparent. */
function draw(rows) {
  const img = createImage(rows[0].length, rows.length);
  rows.forEach((line, y) => [...line].forEach((ch, x) => {
    const c = { '#': [200, 0, 0, 255], b: [0, 0, 200, 255] }[ch];
    if (c) img.data.set(c, (y * img.width + x) * 4);
  }));
  return img;
}
function ascii(img) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let s = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      s += img.data[i + 3] === 0 ? '.' : img.data[i + 2] > 100 ? 'b' : '#';
    }
    rows.push(s);
  }
  return rows;
}

test('pixels isolés : moins de 2 voisins opaques → retirés', () => {
  const out = removeIsolated(draw([
    '#....',
    '..###',
    '..###',
  ]));
  assert.deepEqual(ascii(out), [
    '.....',
    '..###',
    '..###',
  ]);
});

test('îlots de moins de N pixels retirés', () => {
  const out = removeSmallIslands(draw([
    '##...###',
    '#....###',
    '.....###',
  ]), 4);
  assert.deepEqual(ascii(out), [
    '.....###',
    '.....###',
    '.....###',
  ]);
});

test('trou d’1 px entouré bouché avec la couleur majoritaire', () => {
  const out = fillPinholes(draw([
    '.#.',
    'b.#',
    '.#.',
  ]));
  assert.deepEqual(ascii(out)[1], 'b##');
});

test('cleanup enchaîne les trois étapes', () => {
  const out = cleanup(draw([
    '#.......',
    '...####.',
    '...#.##.',
    '...####.',
  ]));
  assert.deepEqual(ascii(out), [
    '........',
    '...####.',
    '...####.',
    '...####.',
  ]);
});

test('agrandissement au plus proche voisin', () => {
  const big = upscale(draw(['#b']), 3);
  assert.equal(big.width, 6);
  assert.equal(big.height, 3);
  assert.deepEqual(ascii(big), ['###bbb', '###bbb', '###bbb']);
});

test('fond magenta #ff00ff à l’export', () => {
  const flat = flatten(draw(['#.']));
  assert.deepEqual([...flat.data.subarray(4, 8)], [255, 0, 255, 255]);
});

test('rognage à la boîte englobante', () => {
  const { image, x, y } = trimTransparent(draw(['....', '.#..', '..#.', '....']));
  assert.deepEqual([x, y, image.width, image.height], [1, 1, 2, 2]);
});
