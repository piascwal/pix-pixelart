import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage } from '../src/core/image.js';
import { createRig, BODY } from '../src/core/rig.js';
import { geodesicSkin, attachOutlines } from '../src/core/geoskin.js';
import { skinFromSkeleton } from '../src/core/skeleton.js';

const put = (img, x, y, c) => img.data.set([...c, 255], (y * img.width + x) * 4);
const fill = (img, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, c); };
const SKIN = [230, 170, 130], SHIRT = [200, 40, 40], PANTS = [40, 60, 120], INK = [10, 10, 20];

/**
 * Un bonhomme de face : torse, bras gauche posé contre le torse (séparé par un trait d'encre),
 * deux jambes larges qui se touchent presque : un vide d'un pixel les sépare en bas, rien en haut.
 */
function bonhomme() {
  const img = createImage(40, 60);
  fill(img, 12, 10, 28, 32, SHIRT);       // torse
  fill(img, 6, 12, 12, 34, SKIN);         // bras gauche, collé au torse
  for (let y = 12; y < 32; y++) put(img, 11, y, INK);   // le contour du bras, côté torse
  fill(img, 28, 12, 34, 34, SKIN);        // bras droit
  fill(img, 12, 32, 28, 58, PANTS);       // le pantalon : les deux jambes collées
  for (let y = 44; y < 58; y++) img.data[(y * 40 + 20) * 4 + 3] = 0;   // l'entrejambe : une colonne vide
  const rig = createRig(40, 60);
  const add = (id, name, pivot, parent = BODY) => { rig.parts.push({ id, name, pivot, parent, pivotSet: true }); rig.order.push(id); };
  add(1, 'Bras gauche', { x: 9.5, y: 13.5 });
  add(2, 'Avant-bras gauche', { x: 9.5, y: 24.5 }, 1);
  add(3, 'Bras droit', { x: 30.5, y: 13.5 });
  add(4, 'Cuisse gauche', { x: 16.5, y: 33.5 });
  add(5, 'Jambe gauche', { x: 16.5, y: 46.5 }, 4);
  add(6, 'Cuisse droite', { x: 23.5, y: 33.5 });
  add(7, 'Jambe droite', { x: 23.5, y: 46.5 }, 6);
  return { img, rig };
}

test('découpe par croissance : le vide entre les jambes les sépare, le torse reste au corps', () => {
  const { img, rig } = bonhomme();
  const n = geodesicSkin(img, rig);
  assert.ok(n > 300, `${n} pixels`);
  const at = (x, y) => rig.labels[y * 40 + x];
  assert.equal(at(20, 20), BODY, 'le milieu du torse');
  // tout le bas des jambes, de chaque côté de l'entrejambe, va à la bonne jambe
  for (let y = 48; y < 58; y++) {
    for (let x = 12; x < 20; x++) assert.equal(at(x, y), 5, `jambe gauche (${x}, ${y})`);
    for (let x = 21; x < 28; x++) assert.equal(at(x, y), 7, `jambe droite (${x}, ${y})`);
  }
  // le bras gauche entier, et son contour d'encre, vont au bras : il n'en reste rien sur le torse
  for (let y = 14; y < 32; y++) assert.notEqual(at(8, y), BODY);
  for (let y = 14; y < 32; y++) assert.notEqual(at(11, y), BODY, `contour du bras (11, ${y})`);
  assert.equal(at(13, 20), BODY, 'le torse derrière le contour');
});

test('découpe par croissance : mieux que l’os le plus proche sur les jambes collées', () => {
  const a = bonhomme(), b = bonhomme();
  skinFromSkeleton(a.img, a.rig);
  geodesicSkin(b.img, b.rig);
  const wrong = (rig) => {
    let k = 0;
    for (let y = 48; y < 58; y++) for (let x = 12; x < 28; x++) {
      if (x === 20) continue;
      const want = x < 20 ? 5 : 7;
      if (rig.labels[y * 40 + x] !== want) k++;
    }
    return k;
  };
  assert.ok(wrong(b.rig) < wrong(a.rig), `${wrong(b.rig)} contre ${wrong(a.rig)}`);
});

test('contours : un trait sombre collé à un membre lui est rattaché, pas à la tête', () => {
  const img = createImage(10, 10);
  fill(img, 0, 0, 10, 10, SHIRT);
  for (let y = 0; y < 10; y++) put(img, 4, y, INK);
  const rig = createRig(10, 10);
  rig.parts.push({ id: 1, name: 'Bras', pivot: { x: 7, y: 1 }, parent: BODY }, { id: 2, name: 'Tête', pivot: { x: 1, y: 1 }, parent: BODY });
  for (let y = 0; y < 10; y++) for (let x = 5; x < 10; x++) rig.labels[y * 10 + x] = 1;
  assert.equal(attachOutlines(img, rig), 10);
  assert.equal(rig.labels[4], 1);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 3; x++) rig.labels[y * 10 + x] = 2;
  for (let y = 0; y < 10; y++) put(img, 3, y, INK);
  assert.equal(attachOutlines(img, rig), 10, 'le trait x = 3 touche le bras (x = 4) : il le rejoint ; la tête ne prend rien');
});
