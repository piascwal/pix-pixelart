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

/**
 * Position estimée de chaque articulation d'un personnage debout (de face ou de trois
 * quarts), d'après sa silhouette. Approximative : l'utilisateur la corrige en glissant les points.
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

  J.neck = { x: cx, y: at(0.2) };
  [J.shoulderL, J.shoulderR] = spread(at(0.27), 0.12, 0.12).map((x) => ({ x, y: at(0.27) }));
  [J.elbowL, J.elbowR] = spread(at(0.42), 0.07, 0.07).map((x) => ({ x, y: at(0.42) }));
  [J.wristL, J.wristR] = spread(at(0.55), 0.05, 0.05).map((x) => ({ x, y: at(0.55) }));

  // jambes : deux segments à hauteur du genou et de la cheville, sinon le segment coupé en deux
  const legX = (y) => {
    const rs = runs(base, Math.round(y)).filter((r) => r[1] - r[0] >= 1);
    if (rs.length >= 2) {
      const l = rs[0], r = rs[rs.length - 1];
      return [(l[0] + l[1] + 1) / 2, (r[0] + r[1] + 1) / 2];
    }
    const [l, r] = spread(y, 0.25, 0.25);
    return [l, r];
  };
  const [kl, kr] = legX(at(0.73));
  const [al, ar] = legX(at(0.92));
  J.kneeL = { x: kl, y: at(0.73) }; J.kneeR = { x: kr, y: at(0.73) };
  J.ankleL = { x: al, y: at(0.92) }; J.ankleR = { x: ar, y: at(0.92) };
  J.hipL = { x: cx + (kl - cx) * 0.6, y: at(0.52) };
  J.hipR = { x: cx + (kr - cx) * 0.6, y: at(0.52) };

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
