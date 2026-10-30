// Squelette humain : les pièces et les articulations d'un personnage debout, posées
// d'après sa silhouette (à ajuster ensuite en glissant les points), puis un
// découpage automatique qui attribue chaque pixel à l'os le plus proche.
//
// Une pièce = un os ; son pivot = l'articulation qui la relie à sa pièce parente :
//   épaule (bras), coude (avant-bras), poignet (main), hanche (cuisse),
//   genou (jambe), cheville (pied), cou (tête).

import { BODY } from './rig.js';
import { focusBounds } from './frame.js';

/** key, name, parent (key | null = corps), joint : articulation qui sert de pivot. */
export const HUMAN_PARTS = [
  { key: 'thighL', name: 'Cuisse gauche', parent: null, joint: 'hipL' },
  { key: 'shinL', name: 'Jambe gauche', parent: 'thighL', joint: 'kneeL' },
  { key: 'footL', name: 'Pied gauche', parent: 'shinL', joint: 'ankleL' },
  { key: 'thighR', name: 'Cuisse droite', parent: null, joint: 'hipR' },
  { key: 'shinR', name: 'Jambe droite', parent: 'thighR', joint: 'kneeR' },
  { key: 'footR', name: 'Pied droit', parent: 'shinR', joint: 'ankleR' },
  { key: 'armL', name: 'Bras gauche', parent: null, joint: 'shoulderL' },
  { key: 'foreL', name: 'Avant-bras gauche', parent: 'armL', joint: 'elbowL' },
  { key: 'handL', name: 'Main gauche', parent: 'foreL', joint: 'wristL' },
  { key: 'armR', name: 'Bras droit', parent: null, joint: 'shoulderR' },
  { key: 'foreR', name: 'Avant-bras droit', parent: 'armR', joint: 'elbowR' },
  { key: 'handR', name: 'Main droite', parent: 'foreR', joint: 'wristR' },
  { key: 'head', name: 'Tête', parent: null, joint: 'neck' },
];

/** Le nom de chaque articulation, tel qu'on le montre sur le point à glisser. */
export const JOINT_LABELS = {
  hipL: 'Hanche gauche', kneeL: 'Genou gauche', ankleL: 'Cheville gauche',
  hipR: 'Hanche droite', kneeR: 'Genou droit', ankleR: 'Cheville droite',
  shoulderL: 'Épaule gauche', elbowL: 'Coude gauche', wristL: 'Poignet gauche',
  shoulderR: 'Épaule droite', elbowR: 'Coude droit', wristR: 'Poignet droit',
  neck: 'Cou',
};

/**
 * Le point d'une pièce est son articulation, pas le membre : « Genou gauche » pour la jambe
 * gauche (qui va du genou à la cheville). Pour une pièce ajoutée à la main : « Articulation de … ».
 */
export function jointLabel(partName) {
  const spec = HUMAN_PARTS.find((p) => p.name === partName);
  return spec ? JOINT_LABELS[spec.joint] : `Articulation de ${partName.toLowerCase()}`;
}

const snap = (v) => Math.floor(v) + 0.5;

/** Segments d'opaque d'une ligne (les trous d'un pixel ne coupent pas). */
function runs(img, y) {
  const out = [];
  let start = -1, gap = 0;
  for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3]) {
      if (start < 0) start = x;
      gap = 0;
    } else if (start >= 0 && ++gap > 1) {
      out.push([start, x - gap]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, img.width - 1 - gap]);
  return out;
}

/** Le segment de la ligne qui contient cx (ou le plus proche). */
function runAround(img, y, cx) {
  const rs = runs(img, Math.max(0, Math.min(img.height - 1, Math.round(y))));
  if (!rs.length) return null;
  let best = rs[0], bd = Infinity;
  for (const r of rs) {
    const d = cx < r[0] ? r[0] - cx : cx > r[1] ? cx - r[1] : 0;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

const opaqueAt = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 0;

/**
 * L'entrejambe : on remonte le vide entre les pieds, ligne par ligne, tant qu'il reste un pixel vide
 * près de l'endroit où il était (il peut dériver d'un pixel par ligne). @returns {{ y, x } | null}
 */
function crotch(img, b, cx) {
  const H = b.y1 - b.y0;
  // une ligne près des pieds, avec deux segments de part et d'autre de l'axe
  for (let y = Math.round(b.y1 - 1 - H * 0.03); y > b.y0 + H * 0.6; y--) {
    const rs = runs(img, y).filter((r) => r[1] - r[0] >= 1);
    const l = rs.filter((r) => r[1] < cx + H * 0.08).pop();
    const r = rs.find((q) => q[0] > cx - H * 0.08 && q !== l);
    if (!l || !r || r[0] <= l[1]) continue;
    let gx = Math.round((l[1] + r[0]) / 2), gy = y;
    for (let yy = y - 1; yy > b.y0 + H * 0.35; yy--) {
      const cands = [0, -1, 1, -2, 2].map((dx) => gx + dx).filter((x) => !opaqueAt(img, x, yy));
      if (!cands.length) break;
      gx = cands[0]; gy = yy;
    }
    return { x: gx + 0.5, y: gy };
  }
  return null;
}

/** Le milieu du segment le plus proche de `x` sur la ligne `y`, du côté donné (-1 gauche, 1 droite) d'un pivot `cut`. */
function legCenter(img, y, cut, side) {
  const rs = runs(img, Math.round(y)).filter((r) => (side < 0 ? r[0] < cut : r[1] >= cut));
  if (!rs.length) return null;
  const r = side < 0 ? rs[rs.length - 1] : rs[0];
  const x0 = side < 0 ? r[0] : Math.max(r[0], cut), x1 = side < 0 ? Math.min(r[1], cut - 1) : r[1];
  return (x0 + x1 + 1) / 2;
}

/**
 * Un bras détaché du torse : sur les lignes entre l'épaule et la hanche, un segment à part, du côté
 * donné. @returns {{ top, bottom, xs: Map<y, x> } | null} xs : milieu du bras ligne par ligne
 */
function armBeside(img, y0, y1, cx, side) {
  const xs = new Map();
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    const rs = runs(img, y);
    const torso = runAround(img, y, cx);
    if (!torso) continue;
    const out = rs.filter((r) => (side < 0 ? r[1] < torso[0] : r[0] > torso[1]) && r[1] - r[0] >= 1);
    if (!out.length) continue;
    const r = side < 0 ? out[out.length - 1] : out[0];
    xs.set(y, (r[0] + r[1] + 1) / 2);
  }
  if (xs.size < 3) return null;
  const ys = [...xs.keys()];
  return { top: Math.min(...ys), bottom: Math.max(...ys), xs };
}

/**
 * Position estimée de chaque articulation d'un personnage debout (de face ou de trois
 * quarts), d'après sa silhouette : le vide entre les jambes donne l'entrejambe et les hanches,
 * le centre de chaque jambe donne genoux et chevilles, et un bras détaché du torse donne coude et
 * poignet. Le cou et les épaules restent aux proportions moyennes. Ce qui n'est pas lisible
 * retombe sur des proportions moyennes. Approximative : l'utilisateur la corrige en glissant les points.
 * @returns {Record<string, {x: number, y: number}>}
 */
export function estimateJoints(base) {
  const b = focusBounds(base);
  const H = Math.max(1, b.y1 - b.y0);
  const at = (f) => b.y0 + f * H;

  // axe du corps : médiane des abscisses du buste
  const xs = [];
  for (let y = Math.floor(at(0.3)); y < at(0.5); y++) {
    for (let x = b.x0; x < b.x1; x++) if (base.data[(y * base.width + x) * 4 + 3]) xs.push(x);
  }
  xs.sort((p, q) => p - q);
  const cx = xs.length ? xs[xs.length >> 1] + 0.5 : (b.x0 + b.x1) / 2;

  const J = {};
  const spread = (y, left, right) => {
    const r = runAround(base, y, cx);
    if (!r) return [cx - H * 0.12, cx + H * 0.12];
    const w = r[1] - r[0] + 1;
    return [r[0] + left * w, r[1] + 1 - right * w];
  };

  // le cou et les épaules : aux proportions moyennes (un chapeau, une capuche ou une barbe trompent
  // toute lecture de la silhouette à cette hauteur)
  J.neck = { x: cx, y: at(0.2) };

  // les jambes : l'entrejambe, puis le centre de chaque jambe
  const c = crotch(base, b, cx);
  const ankleY = at(0.93);
  if (c) {
    const hipY = c.y - H * 0.03;
    const kneeY = (c.y + ankleY) / 2;
    const leg = (y, side, fallback) => legCenter(base, y, c.x, side) ?? fallback;
    const hl = leg(c.y + 2, -1, c.x - H * 0.06), hr = leg(c.y + 2, 1, c.x + H * 0.06);
    J.hipL = { x: hl, y: hipY }; J.hipR = { x: hr, y: hipY };
    J.kneeL = { x: leg(kneeY, -1, hl), y: kneeY }; J.kneeR = { x: leg(kneeY, 1, hr), y: kneeY };
    J.ankleL = { x: leg(ankleY, -1, J.kneeL.x), y: ankleY }; J.ankleR = { x: leg(ankleY, 1, J.kneeR.x), y: ankleY };
  } else {
    const legX = (y) => {
      const rs = runs(base, Math.round(y)).filter((r) => r[1] - r[0] >= 1);
      if (rs.length >= 2) { const l = rs[0], r = rs[rs.length - 1]; return [(l[0] + l[1] + 1) / 2, (r[0] + r[1] + 1) / 2]; }
      return spread(y, 0.25, 0.25);
    };
    const [kl, kr] = legX(at(0.73)), [al, ar] = legX(ankleY);
    J.kneeL = { x: kl, y: at(0.73) }; J.kneeR = { x: kr, y: at(0.73) };
    J.ankleL = { x: al, y: ankleY }; J.ankleR = { x: ar, y: ankleY };
    J.hipL = { x: cx + (kl - cx) * 0.6, y: at(0.52) }; J.hipR = { x: cx + (kr - cx) * 0.6, y: at(0.52) };
  }

  // les bras : épaules un peu sous le cou ; un bras détaché du torse se suit jusqu'à la main
  const shoulderY = at(0.27);
  const [sl, sr] = spread(shoulderY, 0.12, 0.12);
  const hipY = (J.hipL.y + J.hipR.y) / 2;
  for (const [side, key, fallbackX] of [[-1, 'L', sl], [1, 'R', sr]]) {
    // au-dessus de l'entrejambe seulement : plus bas, un segment à part est une jambe
    const arm = armBeside(base, shoulderY, c ? Math.min(hipY + H * 0.1, c.y - 1) : hipY, cx, side);
    if (arm) {
      const elbowY = (shoulderY + arm.bottom) / 2;
      const near = (y) => { let best = null, bd = Infinity; for (const [yy, x] of arm.xs) if (Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = x; } return best; };
      J[`shoulder${key}`] = { x: fallbackX, y: shoulderY };
      J[`elbow${key}`] = { x: near(elbowY), y: elbowY };
      J[`wrist${key}`] = { x: near(arm.bottom), y: arm.bottom - H * 0.03 };
    } else {
      J[`shoulder${key}`] = { x: fallbackX, y: shoulderY };
      const [el, er] = spread(at(0.42), 0.07, 0.07), [wl, wr] = spread(at(0.55), 0.05, 0.05);
      J[`elbow${key}`] = { x: side < 0 ? el : er, y: at(0.42) };
      J[`wrist${key}`] = { x: side < 0 ? wl : wr, y: at(0.55) };
    }
  }

  for (const k of Object.keys(J)) J[k] = { x: snap(J[k].x), y: snap(J[k].y) };
  return J;
}

/* --------------------------------------------------------- découpage auto */

const RADIUS = [
  [/t[eê]te|head/i, 0.14],
  [/main|hand/i, 0.05],
  [/pied|foot/i, 0.07],
  [/jambe|cuisse|mollet|leg|thigh|shin/i, 0.065],
  [/bras|arm/i, 0.05],
];
const radiusFor = (name, H) => H * (RADIUS.find(([re]) => re.test(name))?.[1] ?? 0.05);
const TIP = /main|hand|pied|foot/i;

/**
 * Attribue les pixels du corps (pièce 0) à l'os le plus proche, pour les pièces dont le
 * pivot est placé. Un os va de son pivot au pivot de sa pièce enfant (sinon il se prolonge
 * dans la même direction) ; il n'a ni pixels avant son articulation, ni après celle de son enfant.
 * Le torse reste au corps : un pixel n'est pris que s'il est assez près de l'os.
 * @param {Uint8Array|null} reset pixels attribués par un précédent découpage auto, rendus au corps d'abord
 * @returns {number} nombre de pixels attribués
 */
export function skinFromSkeleton(base, rig, reset = null) {
  const { width: w, height: h } = rig;
  const op = (i) => base.data[i * 4 + 3] > 0;
  if (reset) for (let i = 0; i < reset.length; i++) if (reset[i]) { rig.labels[i] = BODY; reset[i] = 0; }
  const bones = bonesOf(base, rig);

  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!op(i) || rig.labels[i] !== BODY) continue;
    const px = (i % w) + 0.5, py = ((i / w) | 0) + 0.5;
    let best = -1, bd = Infinity;
    for (const bone of bones) {
      const t = ((px - bone.a.x) * bone.ux + (py - bone.a.y) * bone.uy);
      if (t < 0 || (bone.capEnd && t > bone.len)) continue;
      const tt = Math.min(t, bone.len);
      const d = Math.hypot(px - (bone.a.x + bone.ux * tt), py - (bone.a.y + bone.uy * tt));
      if (d > bone.r) continue;
      const score = d / bone.r;
      if (score < bd) { bd = score; best = bone.id; }
    }
    if (best >= 0) {
      rig.labels[i] = best;
      if (reset) reset[i] = 1;
      count++;
    }
  }
  return count;
}

/**
 * Les os des pièces dont le pivot est placé : un os va du pivot de la pièce à celui de sa pièce
 * enfant ; sans enfant, il se prolonge dans la direction parent → pivot (capEnd faux).
 * @returns {Array<{ id, a, ux, uy, len, capEnd, r }>} r : rayon d'influence selon le nom de la pièce
 */
export function bonesOf(base, rig) {
  const fb = focusBounds(base);
  const H = Math.max(1, fb.y1 - fb.y0);
  const placed = rig.parts.filter((p) => p.id !== BODY && p.pivotSet !== false);
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const bones = [];
  for (const part of placed) {
    const kids = placed.filter((q) => q.parent === part.id);
    const parent = byId.get(part.parent);
    const a = part.pivot;
    let b, capEnd = true;
    if (kids.length) {
      const k = kids.find((q) => !TIP.test(q.name) || kids.length === 1) || kids[0];
      b = k.pivot;
    } else {
      // pas d'enfant : on prolonge l'os dans la direction parent → pivot
      let dx = 0, dy = 1;
      if (parent && parent.id !== BODY) { dx = a.x - parent.pivot.x; dy = a.y - parent.pivot.y; }
      else if (/t[eê]te|head/i.test(part.name)) { dx = 0; dy = -1; }
      const n = Math.hypot(dx, dy) || 1;
      const parentLen = parent && parent.id !== BODY ? Math.hypot(a.x - parent.pivot.x, a.y - parent.pivot.y) : a.y - fb.y0;
      const len = TIP.test(part.name) ? Math.max(3, 0.45 * parentLen) : Math.max(4, 1.2 * parentLen);
      b = { x: a.x + (dx / n) * len, y: a.y + (dy / n) * len };
      capEnd = false;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    bones.push({ id: part.id, a, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, len, capEnd, r: radiusFor(part.name, H) });
  }

  return bones;
}
