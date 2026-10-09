// Test de bout en bout sur l'image de référence (joueur de padel en faux
// pixel art, 1408×768, fond magenta foncé). Les tests lisent padel-ia.png,
// version décodée sans perte de padel-ia.jpg (Node n'a pas de décodeur JPEG).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readPNG } from './helpers/png.js';
import { depix } from '../src/core/pipeline.js';
import { nearestIndex } from '../src/core/palette.js';

const img = readPNG(fileURLToPath(new URL('./fixtures/padel-ia.png', import.meta.url)));

test('image de référence chargée', () => {
  assert.equal(img.width, 1408);
  assert.equal(img.height, 768);
});

test('période détectée : 6 ± 0,5 px', () => {
  const r = depix(img);
  assert.ok(Math.abs(r.detected.grid.period - 6) <= 0.5, `période ${r.detected.grid.period}`);
});

test('fond détecté proche de (167, 0, 132)', () => {
  const { r, g, b } = depix(img).detected.background;
  assert.ok(Math.abs(r - 167) + g + Math.abs(b - 132) < 20, `fond ${r},${g},${b}`);
});

for (const cleanup of [null, undefined]) {
  test(`sortie ≈ 94×121 cases non vides (nettoyage ${cleanup === null ? 'désactivé' : 'activé'})`, () => {
    const r = depix(img, { colors: 48, ...(cleanup === null ? { cleanup } : {}) });
    assert.ok(Math.abs(r.image.width - 94) <= 3, `largeur ${r.image.width}`);
    assert.ok(Math.abs(r.image.height - 121) <= 3, `hauteur ${r.image.height}`);
    assert.ok(r.stats.filled > 0.25 * 94 * 121, `${r.stats.filled} cases pleines`);
  });
}

test('48 couleurs : le bleu du logo survit', () => {
  const { palette } = depix(img, { colors: 48 });
  const blue = palette[nearestIndex(palette, 20, 80, 210)];
  assert.ok(blue[2] - blue[0] > 100 && blue[2] - blue[1] > 60, `bleu ${blue}`);
});
