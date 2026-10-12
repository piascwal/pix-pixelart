// Animation par découpe : le sprite est découpé en pièces (groupes de pixels),
// chacune tournant autour d'un pivot (articulation) et rattachée à une pièce
// parente : tourner le bras emporte l'avant-bras. La pièce 0 est le « corps » :
// tout ce qui n'a été attribué à aucune pièce.
//
//   rig  = { width, height, labels: Uint8Array(w*h)   index de pièce par pixel (0 = corps)
//            parts: [{ id, name, pivot: {x, y}, parent }]   (parts[0] = corps)
//            order: [id…] }                              ordre de dessin, du fond vers l'avant
//   pose = { [id]: { angle, dx, dy } }   angle en degrés relatif au parent, décalage en pixels
//
// Fonctions pures sur des images { width, height, data } : testables sous Node.

import { createImage } from './image.js';
import { drawRotated } from './rotsprite.js';

export const BODY = 0;

export function createRig(width, height) {
  return {
    width,
    height,
    labels: new Uint8Array(width * height),
    parts: [{ id: BODY, name: 'Corps', pivot: { x: width / 2, y: height / 2 }, parent: null }],
    order: [BODY],
  };
}

export const emptyPose = () => ({});
const partPose = (pose, id) => pose[id] || { angle: 0, dx: 0, dy: 0 };
export const isRest = (p) => !p || (!p.angle && !p.dx && !p.dy);

/** Image ne contenant que les pixels de la pièce `id`. */
export function pieceImage(base, rig, id) {
  const out = createImage(base.width, base.height);
  for (let i = 0; i < rig.labels.length; i++) {
    if (rig.labels[i] !== id || !base.data[i * 4 + 3]) continue;
    out.data.set(base.data.subarray(i * 4, i * 4 + 4), i * 4);
  }
  return out;
}

/**
 * Corps sans les pièces détachées. Là où une pièce recouvrait le corps (un bras
 * devant le torse, une épaule), il resterait un trou quand la pièce bouge : on le
 * rebouche avec les couleurs voisines, mais seulement s'il est encadré par le corps
 * (à moins de `maxGap` px des deux côtés, horizontalement ou verticalement) ; le vide
 * autour du personnage reste vide.
 */
export function bodyImage(base, rig, { maxGap = 8 } = {}) {
  const { width: w, height: h } = base;
  const out = pieceImage(base, rig, BODY);
  const d = out.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] !== 0;
  const removed = (i) => rig.labels[i] !== BODY && base.data[i * 4 + 3] !== 0;

  const enclosed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!removed(i)) continue;
      const side = (dx, dy) => {
        for (let k = 1; k <= maxGap; k++) if (solid(x + dx * k, y + dy * k)) return true;
        return false;
      };
      if ((side(-1, 0) && side(1, 0)) || (side(0, -1) && side(0, 1))) enclosed[i] = 1;
    }
  }
  // remplissage de proche en proche depuis le corps (la couleur du voisin déjà connu)
  let frontier = true;
  while (frontier) {
    frontier = false;
    const next = [];
    for (let i = 0; i < w * h; i++) {
      if (!enclosed[i] || d[i * 4 + 3]) continue;
      const x = i % w, y = (i - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!solid(nx, ny)) continue;
        next.push([i, (ny * w + nx) * 4]);
        break;
      }
    }
    for (const [i, from] of next) {
      d.set(d.subarray(from, from + 4), i * 4);
      frontier = true;
    }
  }
  return out;
}

/* ------------------------------------------------------------ transformations */

// affine rigide : x' = a·x + c·y + e ; y' = b·x + d·y + f
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (m, n) => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
});
const translate = (x, y) => ({ ...IDENTITY, e: x, f: y });
const rotateAbout = (deg, { x, y }) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return mul(translate(x, y), mul({ a: c, b: s, c: -s, d: c, e: 0, f: 0 }, translate(-x, -y)));
};
export const apply = (m, { x, y }) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

/** Parent effectif : la pièce existe et la chaîne ne boucle pas, sinon le corps. */
function parentOf(rig, part) {
  if (part.id === BODY) return null;
  const ids = new Set(rig.parts.map((p) => p.id));
  let p = part.parent;
  const seen = new Set([part.id]);
  for (let q = p; q !== null && q !== undefined && q !== BODY; q = rig.parts.find((x) => x.id === q)?.parent) {
    if (seen.has(q) || !ids.has(q)) return BODY;
    seen.add(q);
  }
  return ids.has(p) ? p : BODY;
}

/**
 * Transformation de chaque pièce (coordonnées du sprite → image composée) et
 * angle total. origin : décalage du sprite dans l'image (la marge).
 * @returns {Map<number, { m, angle }>}
 */
export function worldTransforms(rig, pose, origin = { x: 0, y: 0 }) {
  const result = new Map();
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const visit = (part) => {
    if (result.has(part.id)) return result.get(part.id);
    const pp = partPose(pose, part.id);
    const parentId = parentOf(rig, part);
    const parent = parentId === null ? { m: translate(origin.x, origin.y), angle: 0 } : visit(byId.get(parentId));
    // décalage dans le repère du parent, puis rotation autour du pivot
    const local = mul(translate(pp.dx || 0, pp.dy || 0), rotateAbout(pp.angle || 0, part.pivot));
    const r = { m: mul(parent.m, local), angle: parent.angle + (pp.angle || 0) };
    result.set(part.id, r);
    return r;
  };
  for (const p of rig.parts) visit(p);
  return result;
}

/** Couleur d'articulation : la plus fréquente des pixels de la pièce autour du pivot. */
function jointColor(base, rig, part, radius = 3) {
  const { width: w } = base;
  const votes = new Map();
  for (let y = Math.floor(part.pivot.y - radius); y <= part.pivot.y + radius; y++) {
    for (let x = Math.floor(part.pivot.x - radius); x <= part.pivot.x + radius; x++) {
      if (x < 0 || y < 0 || x >= w || y >= base.height) continue;
      const i = y * w + x;
      if (rig.labels[i] !== part.id || !base.data[i * 4 + 3]) continue;
      const k = base.data.slice(i * 4, i * 4 + 3).join(',');
      votes.set(k, (votes.get(k) || 0) + 1);
    }
  }
  let best = null, n = 0;
  for (const [k, v] of votes) if (v > n) { n = v; best = k; }
  return best && best.split(',').map(Number);
}

export const marginFor = (rig) => Math.max(8, Math.round(Math.max(rig.width, rig.height) * 0.3));

/**
 * Image d'une pose. Les pièces sont dessinées dans rig.order ; sous chaque pièce
 * qui a bougé par rapport à son parent, un disque de sa couleur bouche le trou
 * de l'articulation. À la pose de repos, on retrouve exactement le sprite.
 * @returns {{ image, owner: Int16Array, margin }} owner : pièce visible par pixel (-1 = vide)
 */
export function composeFrame(base, rig, pose, { jointRadius = 1.6 } = {}) {
  const m = marginFor(rig);
  const out = createImage(base.width + 2 * m, base.height + 2 * m);
  const owner = new Int16Array(out.width * out.height).fill(-1);
  const world = worldTransforms(rig, pose, { x: m, y: m });
  const byId = new Map(rig.parts.map((p) => [p.id, p]));

  for (const id of rig.order) {
    const part = byId.get(id);
    if (!part) continue;
    const w = world.get(id);
    const img = id === BODY ? bodyImage(base, rig) : pieceImage(base, rig, id);
    const dest = apply(w.m, part.pivot);

    if (id !== BODY && !isRest(pose[id])) {
      const color = jointColor(base, rig, part);
      if (color) {
        const r = jointRadius;
        for (let y = Math.floor(dest.y - r); y <= dest.y + r; y++) {
          for (let x = Math.floor(dest.x - r); x <= dest.x + r; x++) {
            if (x < 0 || y < 0 || x >= out.width || y >= out.height) continue;
            if ((x + 0.5 - dest.x) ** 2 + (y + 0.5 - dest.y) ** 2 > r * r) continue;
            const o = (y * out.width + x) * 4;
            out.data.set([...color, 255], o);
            owner[y * out.width + x] = id;
          }
        }
      }
    }
    for (const i of drawRotated(out, img, { pivot: part.pivot, angle: w.angle, dest })) owner[i] = id;
  }
  return { image: out, owner, margin: m };
}

/**
 * Comble les vides qu'ouvre le mouvement des membres : autour de l'articulation de
 * chaque pièce qui a bougé, les pixels vides situés dans la silhouette de repos
 * prennent la couleur de leurs voisins, de proche en proche.
 * @param composed résultat de composeFrame pour cette pose (retouches comprises)
 * @returns {Map<number, number[]>} indice de pixel → [r, g, b, 255], à ajouter aux retouches
 */
export function fillPoseGaps(base, rig, pose, composed) {
  const m = marginFor(rig);
  const { width: W, height: H } = composed;
  const world = worldTransforms(rig, pose, { x: m, y: m });
  const src = (x, y) => {
    const bx = x - m, by = y - m;
    return bx >= 0 && by >= 0 && bx < base.width && by < base.height && base.data[(by * base.width + bx) * 4 + 3] > 0;
  };
  const data = new Uint8ClampedArray(composed.data);
  const todo = new Set();
  for (const part of rig.parts) {
    if (part.id === BODY || isRest(pose[part.id])) continue;
    const pp = partPose(pose, part.id);
    const dest = apply(world.get(part.id).m, part.pivot);
    // épaisseur de la pièce → rayon du vide possible autour de l'articulation
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let i = 0; i < rig.labels.length; i++) {
      if (rig.labels[i] !== part.id || !base.data[i * 4 + 3]) continue;
      const x = i % base.width, y = (i / base.width) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) continue;
    const r = Math.min(14, Math.max(2, 0.7 * Math.min(x1 - x0 + 1, y1 - y0 + 1)) + Math.hypot(pp.dx || 0, pp.dy || 0));
    for (let y = Math.floor(dest.y - r); y <= Math.ceil(dest.y + r); y++) {
      for (let x = Math.floor(dest.x - r); x <= Math.ceil(dest.x + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || data[(y * W + x) * 4 + 3]) continue;
        if ((x + 0.5 - dest.x) ** 2 + (y + 0.5 - dest.y) ** 2 > r * r || !src(x, y)) continue;
        todo.add(y * W + x);
      }
    }
  }
  const out = new Map();
  while (todo.size) {
    const round = [];
    for (const i of todo) {
      const x = i % W, y = (i / W) | 0;
      const votes = new Map();
      for (const [dx, dy, w] of [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const o = (ny * W + nx) * 4;
        if (!data[o + 3]) continue;
        const k = `${data[o]},${data[o + 1]},${data[o + 2]}`;
        votes.set(k, (votes.get(k) || 0) + w);
      }
      let best = null, n = 0;
      for (const [k, v] of votes) if (v > n) { n = v; best = k; }
      if (best) round.push([i, best.split(',').map(Number)]);
    }
    if (!round.length) break;
    for (const [i, c] of round) {
      data.set([...c, 255], i * 4);
      out.set(i, [...c, 255]);
      todo.delete(i);
    }
  }
  return out;
}

/** Retouches à la main d'une image : Map(indice de pixel → [r, g, b, a]), a = 0 pour effacer. */
export function applyEdits(img, edits) {
  if (!edits || !edits.size) return img;
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  for (const [i, rgba] of edits) out.data.set(rgba, i * 4);
  return out;
}

/** Boîte commune à plusieurs images de même taille (pour recadrer une planche). */
export function commonBounds(images) {
  const { width: w, height: h } = images[0];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const img of images) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!img.data[(y * w + x) * 4 + 3]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Planche de sprites horizontale, toutes les images recadrées sur la même boîte. */
export function spriteSheet(images) {
  const b = commonBounds(images);
  const sheet = createImage(b.w * images.length, b.h);
  images.forEach((img, k) => {
    for (let y = 0; y < b.h; y++) {
      const from = ((b.y + y) * img.width + b.x) * 4;
      sheet.data.set(img.data.subarray(from, from + b.w * 4), (y * sheet.width + k * b.w) * 4);
    }
  });
  return { image: sheet, frameWidth: b.w, frameHeight: b.h, count: images.length };
}

/* ------------------------------------------------------- découpage assisté */

/**
 * Complète le découpage : chaque pièce déjà peinte (même quelques traits) s'étend
 * aux pixels voisins du corps qui lui sont reliés, en s'arrêtant aux pivots :
 *   - jamais en deçà de son propre pivot (l'épaule ne mord pas sur le torse) ;
 *   - jamais au-delà du pivot d'une pièce enfant (le coude coupe bras / avant-bras).
 * Quand deux pièces se disputent un pixel, la plus proche l'emporte (parcours en
 * largeur depuis tous les pixels déjà peints). Seuls les pixels du corps changent.
 * @returns {number} nombre de pixels attribués
 */
export function completeParts(base, rig) {
  const { width: w, height: h } = rig;
  const opaque = (i) => base.data[i * 4 + 3] !== 0;
  const byId = new Map(rig.parts.map((p) => [p.id, p]));

  // axe de chaque pièce : du pivot vers le centre de ses pixels déjà peints
  const sums = new Map();
  for (let i = 0; i < rig.labels.length; i++) {
    const l = rig.labels[i];
    if (l === BODY || !opaque(i)) continue;
    const s = sums.get(l) || { x: 0, y: 0, n: 0 };
    s.x += (i % w) + 0.5; s.y += Math.floor(i / w) + 0.5; s.n++;
    sums.set(l, s);
  }
  const axis = new Map();
  for (const [id, s] of sums) {
    const part = byId.get(id);
    if (!part) continue;
    const dx = s.x / s.n - part.pivot.x, dy = s.y / s.n - part.pivot.y;
    const len = Math.hypot(dx, dy);
    axis.set(id, len >= 1.5 ? { x: dx / len, y: dy / len } : null);
  }
  const children = new Map();
  for (const p of rig.parts) {
    if (p.id === BODY) continue;
    const parent = parentOf(rig, p);
    if (parent !== null && parent !== BODY) children.set(parent, [...(children.get(parent) || []), p.id]);
  }
  // Un pivot d'épaule est souvent placé à l'intérieur du torse : sans précaution, la pièce
  // se répandrait dans toute la bande de torse qui borde le membre. On cherche donc, en
  // remontant du membre vers le pivot, l'endroit où l'épaisseur du membre bondit
  // (le membre débouche sur le corps) : c'est la vraie frontière.
  const opaqueAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && opaque(y * w + x);
  const thicknessAt = (px, py, n) => {
    let count = 1;
    for (const sign of [1, -1]) {
      for (let k = 1; k <= 64; k++) {
        if (!opaqueAt(Math.floor(px + sign * n.x * k), Math.floor(py + sign * n.y * k))) break;
        count++;
      }
    }
    return count;
  };
  const cut = new Map();   // pièce → coordonnée minimale le long de son axe, depuis le pivot
  for (const [id, sum] of sums) {
    const part = byId.get(id);
    const a = axis.get(id);
    if (!part || !a || part.pivotSet === false) continue;
    const n = { x: -a.y, y: a.x };
    const samples = [];
    for (let i = 0; i < rig.labels.length && samples.length < 40; i += 1) {
      if (rig.labels[i] !== id || !opaque(i)) continue;
      samples.push(thicknessAt((i % w) + 0.5, Math.floor(i / w) + 0.5, n));
    }
    samples.sort((m, k) => m - k);
    const t0 = samples[samples.length >> 1] || 1;
    let min = -0.5;
    const s0 = Math.hypot(sum.x / sum.n - part.pivot.x, sum.y / sum.n - part.pivot.y);
    for (let sPos = s0; sPos >= -0.5; sPos -= 0.5) {
      const px = part.pivot.x + a.x * sPos, py = part.pivot.y + a.y * sPos;
      if (thicknessAt(px, py, n) > 1.8 * t0 + 2) { min = sPos + 0.5; break; }
    }
    cut.set(id, min);
  }

  /** Le pixel (centre en x+0,5 ; y+0,5) est-il dans la zone autorisée de la pièce ? */
  const allowed = (id, x, y) => {
    const part = byId.get(id);
    const a = axis.get(id);
    if (a && part.pivotSet !== false && (x + 0.5 - part.pivot.x) * a.x + (y + 0.5 - part.pivot.y) * a.y < (cut.get(id) ?? -0.5)) return false;
    for (const c of children.get(id) || []) {
      const kid = byId.get(c);
      const ka = axis.get(c);
      if (!ka || kid.pivotSet === false) continue;
      if ((x + 0.5 - kid.pivot.x) * ka.x + (y + 0.5 - kid.pivot.y) * ka.y >= -0.5) return false;
    }
    return true;
  };

  const queue = [];
  for (let i = 0; i < rig.labels.length; i++) if (rig.labels[i] !== BODY && opaque(i)) queue.push(i);
  let assigned = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const id = rig.labels[i];
    if (byId.get(id)?.pivotSet === false) continue;   // pivot pas encore placé : on ne sait pas où s'arrêter
    const x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (rig.labels[j] !== BODY || !opaque(j) || !allowed(id, nx, ny)) continue;
      rig.labels[j] = id;
      assigned++;
      queue.push(j);
    }
  }
  return assigned;
}
