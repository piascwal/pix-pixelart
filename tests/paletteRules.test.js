import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePalette, EMPTY_RULES, applyPalette } from '../src/core/palette.js';
import { focusBounds } from '../src/core/frame.js';
import { depix } from '../src/core/pipeline.js';
import { createImage, toHex } from '../src/core/image.js';
import { fakePixelArt, randomSprite } from './helpers/synthetic.js';

const RED = [230, 60, 40];
const DARK_RED = [200, 40, 30];
const BLUE = [30, 90, 200];
const WHITE = [250, 250, 250];
const palette = [RED, DARK_RED, BLUE, WHITE];

test('sans règle : chaque couleur reste elle-même', () => {
  assert.deepEqual(resolvePalette(palette, EMPTY_RULES), palette);
  assert.deepEqual(resolvePalette(palette), palette);
});

test('couleur exclue : ses pixels prennent la couleur restante la plus proche', () => {
  const t = resolvePalette(palette, { excluded: [toHex(DARK_RED)], replace: {} });
  assert.deepEqual(t[1], RED);
  assert.deepEqual(t[0], RED);
  assert.deepEqual(t[2], BLUE);
});

test('couleur remplacée par une autre couleur choisie', () => {
  const t = resolvePalette(palette, { excluded: [], replace: { [toHex(RED)]: toHex(WHITE) } });
  assert.deepEqual(t[0], WHITE);
  assert.deepEqual(t[1], DARK_RED);
});

test('remplacements en chaîne, et cycle sans boucle infinie', () => {
  const chain = resolvePalette(palette, { excluded: [], replace: { [toHex(RED)]: toHex(BLUE), [toHex(BLUE)]: toHex(WHITE) } });
  assert.deepEqual(chain[0], WHITE);
  const cycle = resolvePalette(palette, { excluded: [], replace: { [toHex(RED)]: toHex(BLUE), [toHex(BLUE)]: toHex(RED) } });
  assert.equal(cycle.length, 4);
});

test('un remplacement l’emporte sur l’exclusion ; cible exclue → plus proche restante', () => {
  const t = resolvePalette(palette, {
    excluded: [toHex(RED), toHex(WHITE)],
    replace: { [toHex(RED)]: toHex(BLUE) },
  });
  assert.deepEqual(t[0], BLUE);
  // blanc exclu → une des couleurs restantes (non exclues)
  assert.ok([DARK_RED, BLUE].some((c) => toHex(c) === toHex(t[3])));
});

test('règles visant une couleur absente ignorées ; tout exclure garde la palette', () => {
  const ghost = resolvePalette(palette, { excluded: ['#123456'], replace: { '#abcdef': toHex(RED) } });
  assert.deepEqual(ghost, palette);
  const all = resolvePalette(palette, { excluded: palette.map(toHex), replace: {} });
  assert.deepEqual(all, palette);
});

test('applyPalette avec targets', () => {
  const img = createImage(2, 1);
  img.data.set([...RED, 255, ...BLUE, 255]);
  const out = applyPalette(img, palette, resolvePalette(palette, { excluded: [], replace: { [toHex(RED)]: toHex(WHITE) } }));
  assert.deepEqual([...out.data], [...WHITE, 255, ...BLUE, 255]);
});

test('pipeline : exclure une couleur la retire du résultat', () => {
  const sprite = randomSprite(16, 12);
  const img = fakePixelArt(sprite, { period: 6, offsetX: 5, offsetY: 4, noise: 4 });
  const base = depix(img, { cleanup: null, colors: 6 });
  const victim = toHex(base.palette[0]);
  const r = depix(img, { cleanup: null, colors: 6, paletteRules: { excluded: [victim], replace: {} } });
  const used = new Set();
  for (let i = 0; i < r.image.data.length; i += 4) {
    if (r.image.data[i + 3]) used.add(toHex([r.image.data[i], r.image.data[i + 1], r.image.data[i + 2]]));
  }
  assert.ok(!used.has(victim));
  assert.equal(r.stats.colors, 5);
  assert.equal(r.palette.length, 6); // la palette complète reste affichée
});

test('cadrage : les poussières isolées ne comptent pas', () => {
  const img = createImage(60, 40);
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([10, 10, 10, 255], (y * 60 + x) * 4);
  };
  fill(20, 10, 40, 30);   // le sprite
  fill(2, 1, 3, 2);       // poussière en haut à gauche
  fill(57, 38, 58, 39);   // poussière en bas à droite
  assert.deepEqual(focusBounds(img), { x0: 20, y0: 10, x1: 40, y1: 30 });
});

test('cadrage : un petit élément détaché mais réel (balle) est gardé', () => {
  const img = createImage(100, 60);
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([10, 10, 10, 255], (y * 100 + x) * 4);
  };
  fill(30, 5, 80, 55);    // 2500 px
  fill(5, 30, 10, 35);    // balle 5×5 = 25 px
  assert.equal(focusBounds(img).x0, 5);
});

test('cadrage : image vide → image entière', () => {
  assert.deepEqual(focusBounds(createImage(5, 4)), { x0: 0, y0: 0, x1: 5, y1: 4 });
});

test('couleur écartée dont la plus proche est remplacée : le remplacement s\'applique aussi (bug signalé)', () => {
  const A = [66, 2, 55];      // violet sombre, remplacé par noir
  const A2 = [70, 8, 62];     // violet voisin, écarté : ses pixels vont vers A…
  const BLACK = [7, 3, 6];
  const OTHER = [240, 200, 160];
  const pal = [A, A2, BLACK, OTHER];
  const t = resolvePalette(pal, { excluded: [toHex(A2)], replace: { [toHex(A)]: toHex(BLACK) } });
  assert.deepEqual(t[0], BLACK, 'A est remplacée par le noir');
  assert.deepEqual(t[1], BLACK, '…et A2, écartée, suit : elle ne reste pas violette');
  for (const c of t) assert.ok(![toHex(A), toHex(A2)].includes(toHex(c)), 'plus aucun violet dans le résultat');
});

test('chaîne mixte : écartée → plus proche remplacée → cible elle-même remplacée', () => {
  const [A, A2, B, C] = [[10, 10, 10], [12, 12, 12], [200, 0, 0], [0, 200, 0]];
  const t = resolvePalette([A, A2, B, C], { excluded: [toHex(A2)], replace: { [toHex(A)]: toHex(B), [toHex(B)]: toHex(C) } });
  assert.deepEqual(t[1], C);
  assert.deepEqual(t[0], C);
});
