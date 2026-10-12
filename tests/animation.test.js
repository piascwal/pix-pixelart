import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scale2x, drawRotated } from '../src/core/rotsprite.js';
import { createRig, composeFrame, worldTransforms, apply, bodyImage, spriteSheet, applyEdits, BODY } from '../src/core/rig.js';
import { createImage, toHex, crop } from '../src/core/image.js';
import { colorHistogram } from '../src/core/palette.js';

const RED = [220, 40, 40, 255], BLUE = [30, 60, 220, 255], SKIN = [200, 150, 110, 255], GREY = [120, 120, 120, 255];
const put = (img, x, y, c) => img.data.set(c, (y * img.width + x) * 4);
const at = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const fill = (img, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, c); };
const opaque = (img) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i]) n++; return n; };

test('Scale2x : ×2, et aucune couleur nouvelle', () => {
  const img = createImage(3, 3);
  put(img, 1, 1, RED); put(img, 0, 0, BLUE);
  const up = scale2x(img);
  assert.deepEqual([up.width, up.height], [6, 6]);
  const before = new Set(colorHistogram(img).keys());
  for (const c of colorHistogram(up).keys()) assert.ok(before.has(c));
});

test('rotation 0 et décalage entier : copie exacte', () => {
  const piece = createImage(6, 6);
  fill(piece, 1, 2, 5, 3, RED);
  const out = createImage(10, 10);
  drawRotated(out, piece, { pivot: { x: 1.5, y: 2.5 }, angle: 0, dest: { x: 3.5, y: 4.5 } });
  assert.deepEqual(at(out, 3, 4), RED);
  assert.deepEqual(at(out, 6, 4), RED);
  assert.equal(opaque(out), 4);
});

test('rotation 90° : une barre horizontale devient verticale, même longueur, mêmes couleurs', () => {
  const piece = createImage(12, 12);
  fill(piece, 2, 5, 10, 7, RED);          // 8 × 2
  const out = createImage(12, 12);
  drawRotated(out, piece, { pivot: { x: 2, y: 6 }, angle: 90, dest: { x: 6, y: 2 } });
  let minY = 99, maxY = -1, minX = 99, maxX = -1;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (at(out, x, y)[3]) {
    minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    assert.deepEqual(at(out, x, y), RED);
  }
  assert.equal(maxY - minY + 1, 8, 'longueur conservée');
  assert.equal(maxX - minX + 1, 2, 'épaisseur conservée');
});

test('rotation 30° : uniquement les couleurs d\'origine, pas de flou', () => {
  const piece = createImage(16, 16);
  fill(piece, 3, 6, 13, 9, BLUE); fill(piece, 3, 9, 13, 10, SKIN);
  const out = createImage(24, 24);
  drawRotated(out, piece, { pivot: { x: 3, y: 8 }, angle: 30, dest: { x: 8, y: 8 } });
  const allowed = new Set([toHex(BLUE), toHex(SKIN)]);
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    assert.ok(allowed.has(toHex([out.data[i], out.data[i + 1], out.data[i + 2]])));
  }
  assert.ok(Math.abs(opaque(out) - 40) <= 8, `surface conservée (${opaque(out)} px)`);
});

/** Petit personnage : corps gris 6×10, bras rouge (4×2) à droite, avant-bras bleu (4×2) au bout. */
function puppet() {
  const base = createImage(20, 14);
  fill(base, 2, 2, 8, 12, GREY);
  fill(base, 8, 3, 12, 5, RED);
  fill(base, 12, 3, 16, 5, BLUE);
  const rig = createRig(20, 14);
  rig.parts.push({ id: 1, name: 'Bras', pivot: { x: 8, y: 4 }, parent: BODY });
  rig.parts.push({ id: 2, name: 'Avant-bras', pivot: { x: 12, y: 4 }, parent: 1 });
  rig.order.push(1, 2);
  for (let y = 3; y < 5; y++) {
    for (let x = 8; x < 12; x++) rig.labels[y * 20 + x] = 1;
    for (let x = 12; x < 16; x++) rig.labels[y * 20 + x] = 2;
  }
  return { base, rig };
}

test('pose de repos : on retrouve exactement le sprite', () => {
  const { base, rig } = puppet();
  const { image, margin } = composeFrame(base, rig, {});
  assert.deepEqual([...crop(image, margin, margin, 20, 14).data], [...base.data]);
});

test('hiérarchie : tourner le bras emporte l\'avant-bras', () => {
  const { rig } = puppet();
  const w = worldTransforms(rig, { 1: { angle: 90 } });
  const elbow = apply(w.get(2).m, rig.parts[2].pivot);
  assert.ok(Math.abs(elbow.x - 8) < 1e-9 && Math.abs(elbow.y - 8) < 1e-9, JSON.stringify(elbow));
  assert.equal(w.get(2).angle, 90);
});

test('bras baissé : le bleu passe sous l\'épaule, le trou du coude est bouché', () => {
  const { base, rig } = puppet();
  const { image, margin: m, owner } = composeFrame(base, rig, { 1: { angle: 90 } });
  // l'avant-bras est maintenant sous le bras, vers y = 8..11 (+ marge)
  let blueBelow = 0;
  for (let y = 9; y < 13; y++) for (let x = 7; x < 9; x++) if (toHex(at(image, x + m, y + m)) === toHex(BLUE)) blueBelow++;
  assert.ok(blueBelow >= 4, `avant-bras sous l'épaule (${blueBelow})`);
  // plus rien de rouge ni de bleu à l'ancienne place
  assert.equal(at(image, 13 + m, 3 + m)[3], 0);
  assert.ok(owner.some((o) => o === 2));
});

test('le corps rebouche ce que la pièce cachait, pas le vide autour', () => {
  const base = createImage(12, 12);
  fill(base, 2, 2, 10, 10, GREY);
  fill(base, 4, 5, 12, 7, RED);           // bras devant le corps, qui dépasse à droite
  const rig = createRig(12, 12);
  rig.parts.push({ id: 1, name: 'Bras', pivot: { x: 4, y: 6 }, parent: BODY });
  rig.order.push(1);
  for (let y = 5; y < 7; y++) for (let x = 4; x < 12; x++) rig.labels[y * 12 + x] = 1;
  const body = bodyImage(base, rig);
  assert.deepEqual(at(body, 6, 5), GREY, 'trou dans le corps rebouché');
  assert.equal(at(body, 11, 5)[3], 0, 'hors du corps : reste vide');
});

test('retouches à la main appliquées par-dessus une image', () => {
  const img = createImage(2, 1);
  const out = applyEdits(img, new Map([[1, RED]]));
  assert.deepEqual(at(out, 1, 0), RED);
  assert.equal(at(img, 1, 0)[3], 0, 'l\'original n\'est pas modifié');
});

test('planche : images recadrées sur une boîte commune, côte à côte', () => {
  const a = createImage(10, 10); fill(a, 2, 2, 4, 8, RED);
  const b = createImage(10, 10); fill(b, 5, 1, 8, 3, BLUE);
  const s = spriteSheet([a, b]);
  assert.deepEqual([s.frameWidth, s.frameHeight, s.image.width, s.image.height], [6, 7, 12, 7]);
  assert.deepEqual(at(s.image, 0, 1), RED);
  assert.deepEqual(at(s.image, 6 + 3, 0), BLUE);
});
