import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif, lzwEncode, buildPalette } from '../src/core/gif.js';
import { lerpPose, inBetween } from '../src/core/poses.js';
import { detectLimbs, walkPoses } from '../src/core/walk.js';
import { createRig, completeParts, composeFrame, BODY } from '../src/core/rig.js';
import { createImage } from '../src/core/image.js';
import { rng } from './helpers/synthetic.js';

/* ----------------------------------------------------------- décodeur GIF (test) */

function lzwDecode(data, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let table = [];
  const reset = () => { table = []; for (let i = 0; i < clear; i++) table[i] = [i]; table[clear] = []; table[eoi] = []; size = minCode + 1; next = eoi + 1; };
  reset();
  const out = [];
  let bits = 0, cur = 0, pos = 0, prev = null;
  for (;;) {
    while (bits < size) { if (pos >= data.length) return out; cur |= data[pos++] << bits; bits += 8; }
    const code = cur & ((1 << size) - 1);
    cur >>>= size; bits -= size;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) return out;
    let entry;
    if (code < next && table[code]) entry = table[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('code LZW invalide');
    out.push(...entry);
    if (prev) { table[next++] = [...prev, entry[0]]; if (next === (1 << size) && size < 12) size++; }
    prev = entry;
  }
}

function decodeGif(bytes) {
  const u16 = (i) => bytes[i] | (bytes[i + 1] << 8);
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
  const width = u16(6), height = u16(8);
  const packed = bytes[10];
  const tableSize = 1 << ((packed & 7) + 1);
  let pos = 13;
  const gct = [];
  for (let i = 0; i < tableSize; i++) gct.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
  const frames = [];
  let delay = 0, transparent = -1, loop = null;
  while (bytes[pos] !== 0x3b) {
    if (bytes[pos] === 0x21) {
      const label = bytes[pos + 1];
      pos += 2;
      if (label === 0xf9) { transparent = bytes[pos + 1] & 1 ? bytes[pos + 4] : -1; delay = u16(pos + 2); }
      if (label === 0xff && bytes[pos] === 11) loop = u16(pos + 14);
      while (bytes[pos] !== 0) pos += bytes[pos] + 1;
      pos++;
    } else if (bytes[pos] === 0x2c) {
      const w = u16(pos + 5), h = u16(pos + 7);
      pos += 10;
      const minCode = bytes[pos++];
      const chunks = [];
      while (bytes[pos] !== 0) { chunks.push(...bytes.slice(pos + 1, pos + 1 + bytes[pos])); pos += bytes[pos] + 1; }
      pos++;
      const idx = lzwDecode(chunks, minCode);
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        if (idx[i] === transparent) continue;
        rgba.set([...gct[idx[i]], 255], i * 4);
      }
      frames.push({ width: w, height: h, data: rgba, delay });
    } else throw new Error('bloc inconnu 0x' + bytes[pos].toString(16));
  }
  return { width, height, frames, loop };
}

const RED = [220, 40, 40], BLUE = [30, 60, 220], GREEN = [40, 180, 70];
const put = (img, x, y, c) => img.data.set([...c, 255], (y * img.width + x) * 4);

test('GIF : aller-retour exact, transparence, durées et boucle', () => {
  const frames = [0, 1, 2].map((k) => {
    const img = createImage(9, 7);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) if ((x + y + k) % 3) put(img, x, y, [RED, BLUE, GREEN][(x * y + k) % 3]);
    return img;
  });
  const gif = decodeGif(encodeGif(frames, { delayMs: [100, 60, 200] }));
  assert.deepEqual([gif.width, gif.height, gif.frames.length, gif.loop], [9, 7, 3, 0]);
  assert.deepEqual(gif.frames.map((f) => f.delay), [10, 6, 20]);
  frames.forEach((f, k) => assert.deepEqual([...gif.frames[k].data], [...f.data], `image ${k}`));
});

test('GIF : grande image aléatoire (table LZW pleine, réinitialisée) et plus de 255 couleurs', () => {
  const r = rng(11);
  const img = createImage(64, 64);
  for (let i = 0; i < 64 * 64; i++) img.data.set([r() * 255, r() * 255, r() * 255, 255], i * 4);
  const bytes = encodeGif([img]);
  const gif = decodeGif(bytes);
  assert.deepEqual([gif.width, gif.height], [64, 64]);
  // quantifié : chaque pixel est une couleur de la palette, pas d'erreur de décodage
  const pal = buildPalette([img]);
  assert.equal(pal.exact, false);
  assert.ok(pal.colors.length <= 255);
  assert.ok(gif.frames[0].data.every((v, i) => i % 4 !== 3 || v === 255));
});

test('LZW : une longue suite d\'un seul indice se décode', () => {
  const idx = new Uint8Array(5000).fill(3);
  const bytes = lzwEncode(idx, 2);
  assert.deepEqual(lzwDecode(bytes, 2).slice(0, 5000), [...idx]);
});

/* -------------------------------------------------------------- interpolation */

test('interpolation : angles réels, décalages entiers, pièces absentes = repos', () => {
  const a = { 1: { angle: 0, dx: 0, dy: 0 } };
  const b = { 1: { angle: 40, dx: 4, dy: -4 }, 2: { angle: 10, dx: 0, dy: 0 } };
  assert.deepEqual(lerpPose(a, b, 0.5), { 1: { angle: 20, dx: 2, dy: -2 }, 2: { angle: 5, dx: 0, dy: 0 } });
  const mid = inBetween(a, b, 3);
  assert.deepEqual(mid.map((p) => p[1].angle), [10, 20, 30]);
  assert.ok(mid.every((p) => Number.isInteger(p[1].dx) && Number.isInteger(p[1].dy)));
});

/* ------------------------------------------------------- découpage assisté */

/** Torse 10×16 au centre, bras gauche horizontal (3 pièces possibles), jambes en bas. */
function figure() {
  const base = createImage(40, 40);
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(base, x, y, c); };
  fill(15, 8, 25, 24, [200, 200, 200]);        // torse
  fill(16, 24, 19, 36, [180, 130, 100]);       // jambe gauche
  fill(21, 24, 24, 36, [180, 130, 100]);       // jambe droite
  fill(3, 10, 15, 13, [180, 130, 100]);        // bras gauche, collé au torse (x < 15)
  fill(25, 10, 37, 13, [180, 130, 100]);       // bras droit
  const rig = createRig(40, 40);
  const add = (id, name, pivot, parent = BODY) => { rig.parts.push({ id, name, pivot, parent, pivotSet: true }); rig.order.push(id); };
  add(1, 'Bras gauche', { x: 14.5, y: 11.5 });
  add(2, 'Avant-bras gauche', { x: 8.5, y: 11.5 }, 1);
  add(3, 'Cuisse gauche', { x: 17.5, y: 24.5 });
  add(4, 'Jambe gauche', { x: 17.5, y: 30.5 }, 3);
  add(5, 'Bras droit', { x: 25.5, y: 11.5 });
  add(6, 'Cuisse droite', { x: 22.5, y: 24.5 });
  const lab = (id, x, y) => { rig.labels[y * 40 + x] = id; };
  lab(1, 12, 11); lab(2, 5, 11); lab(3, 17, 26); lab(4, 17, 33); lab(5, 30, 11); lab(6, 22, 26);   // un seul pixel par pièce
  return { base, rig };
}

test('découpage assisté : quelques graines suffisent, les pivots fixent les frontières', () => {
  const { base, rig } = figure();
  const n = completeParts(base, rig);
  const at = (x, y) => rig.labels[y * 40 + x];
  assert.ok(n > 60, `${n} pixels attribués`);
  // bras gauche : haut du bras de x 9 à 14, avant-bras de x 3 à 8 ; le torse (x ≥ 15) reste au corps
  assert.equal(at(14, 11), 1); assert.equal(at(9, 12), 1);
  assert.equal(at(8, 11), 2); assert.equal(at(3, 10), 2);
  assert.equal(at(15, 11), BODY, 'le torse n\'est pas mordu par l\'épaule');
  // jambe : cuisse jusqu'au genou (y 30), bas de jambe en dessous
  assert.equal(at(17, 25), 3); assert.equal(at(17, 29), 3);
  assert.equal(at(17, 31), 4); assert.equal(at(17, 35), 4);
  assert.equal(at(17, 23), BODY, 'la cuisse ne remonte pas dans le torse');
  // une jambe sans bas de jambe possède toute la jambe ; les deux jambes restent séparées
  assert.equal(at(22, 33), 6);
  assert.notEqual(at(17, 33), 6);
});

test('découpage assisté : pivot d\'épaule à l\'intérieur du torse, le torse n\'est pas happé', () => {
  const { base, rig } = figure();
  rig.parts.find((p) => p.id === 1).pivot = { x: 17.5, y: 11.5 };    // 2,5 px à l'intérieur du torse (x ≥ 15)
  rig.parts.find((p) => p.id === 5).pivot = { x: 22.5, y: 11.5 };
  completeParts(base, rig);
  let leaked = 0;
  for (let y = 0; y < 40; y++) for (let x = 15; x < 25; x++) if (rig.labels[y * 40 + x] === 1 || rig.labels[y * 40 + x] === 5) leaked++;
  assert.equal(leaked, 0, `${leaked} pixels du torse attribués au bras`);
  assert.equal(rig.labels[11 * 40 + 14], 1, 'le bras lui-même est bien attribué');
  assert.equal(rig.labels[11 * 40 + 26], 5);
});

test('découpage assisté : sans pivot placé, rien ne déborde', () => {
  const { base, rig } = figure();
  rig.parts.find((p) => p.id === 1).pivotSet = false;
  completeParts(base, rig);
  let n = 0;
  for (const l of rig.labels) if (l === 1) n++;
  assert.equal(n, 1, 'la pièce sans pivot reste au pixel d\'origine');
});

/* -------------------------------------------------------------------- marche */

test('marche : membres reconnus par la géométrie, bras écarté ramené le long du corps', () => {
  const { base, rig } = figure();
  completeParts(base, rig);
  const limbs = detectLimbs(base, rig);
  assert.equal(limbs.legs.length, 2);
  assert.equal(limbs.arms.length, 2);
  const armL = limbs.arms.find((a) => a.side < 0);
  assert.deepEqual(armL.parts, [1, 2]);
  assert.equal(armL.base, -90, 'bras gauche écarté vers la gauche : -90° pour pendre');
  assert.equal(limbs.arms.find((a) => a.side > 0).base, 90);
  assert.equal(limbs.legs.find((l) => l.side < 0).base, 0);
});

test('marche : 8 poses, les jambes alternent, le cycle boucle', () => {
  const { base, rig } = figure();
  completeParts(base, rig);
  const limbs = detectLimbs(base, rig);
  for (const style of ['face', 'droite', 'gauche']) {
    const poses = walkPoses(limbs, { style });
    assert.equal(poses.length, 8);
    assert.notDeepEqual(poses[1], poses[5]);
    // jambe gauche (phase 0) et jambe droite (phase π) sont décalées d'une demi-période
    const l = poses.map((p) => JSON.stringify(p[3] || p[4]));
    assert.notEqual(l[0], l[2]);
    // première et dernière image consécutives : on peut enchaîner la boucle sans saut
    const angles = (p) => Object.values(p).map((q) => q.angle);
    const diff = Math.max(...angles(poses[7]).map((a, k) => Math.abs(a - angles(poses[0])[k])));
    assert.ok(diff <= 45, `${style} : saut de ${diff}° entre l'image 8 et l'image 1`);
  }
  // face : un pied se lève (dy négatif), jamais de rotation de jambe
  const face = walkPoses(limbs, { style: 'face' });
  assert.ok(face.some((p) => (p[4]?.dy || p[3]?.dy) < 0));
  assert.ok(face.every((p) => !p[3]?.angle && !p[4]?.angle));
  // profil vers la droite : la cuisse avant a un angle négatif (sens antihoraire)
  const right = walkPoses(limbs, { style: 'droite' });
  assert.ok(right.some((p) => p[3].angle < 0) && right.some((p) => p[3].angle > 0));
});

test('marche : les poses se composent en images sans erreur', () => {
  const { base, rig } = figure();
  completeParts(base, rig);
  const limbs = detectLimbs(base, rig);
  for (const pose of walkPoses(limbs, { style: 'droite' })) {
    const { image } = composeFrame(base, rig, pose);
    let n = 0;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i]) n++;
    assert.ok(n >= 200, `${n} pixels`);
  }
});

test('marche : rien à animer sans membre', () => {
  const base = createImage(10, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) put(base, x, y, RED);
  assert.equal(detectLimbs(base, createRig(10, 10)), null);
});
