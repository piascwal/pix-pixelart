// Découpe auto « à l'intérieur du dessin » : chaque pièce grandit pixel par pixel depuis son
// os (le segment pivot → pivot de sa pièce enfant), sans jamais traverser le vide ; le premier
// arrivé prend le pixel. Traverser un trait sombre (le contour qu'a dessiné l'artiste entre un
// bras et le torse) coûte cher : les frontières suivent les contours. L'entrejambe, vide, sépare
// les deux jambes sans rien faire de plus.
//
// Le corps a lui aussi ses graines : le torse, c'est-à-dire l'intérieur de l'enveloppe des pivots
// rattachés au corps (épaules, hanches, cou), loin de tout os. Une pièce ne revient jamais en
// arrière de son articulation : un bras ne mord pas le torse au-delà de l'épaule.
//
// Puis les contours sombres restés au corps et collés à un membre lui sont rattachés : sinon,
// quand le membre tourne, ils restent sur place (un coude en double).

import { BODY } from './rig.js';
import { bonesOf } from './skeleton.js';

const HEAD = /t[eê]te|head/i;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const luminance = (d, i) => 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];

/** Tas binaire minimal (distance, pixel). */
function heap() {
  const ds = [], ps = [];
  const swap = (a, b) => { [ds[a], ds[b]] = [ds[b], ds[a]]; [ps[a], ps[b]] = [ps[b], ps[a]]; };
  return {
    get size() { return ds.length; },
    push(dist, p) {
      ds.push(dist); ps.push(p);
      for (let i = ds.length - 1; i > 0;) {
        const j = (i - 1) >> 1;
        if (ds[j] <= ds[i]) break;
        swap(i, j); i = j;
      }
    },
    pop() {
      const top = [ds[0], ps[0]];
      const ld = ds.pop(), lp = ps.pop();
      if (ds.length) {
        ds[0] = ld; ps[0] = lp;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < ds.length && ds[l] < ds[m]) m = l;
          if (r < ds.length && ds[r] < ds[m]) m = r;
          if (m === i) break;
          swap(i, m); i = m;
        }
      }
      return top;
    },
  };
}

/** Enveloppe convexe (chaîne monotone) d'une liste de points {x, y}. */
function hull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Distance d'un point à un os (segment, ou demi-droite si l'os n'a pas de bout), et position le long de l'os. */
function toBone(bone, x, y) {
  const t = (x - bone.a.x) * bone.ux + (y - bone.a.y) * bone.uy;
  const tt = Math.max(0, bone.capEnd ? Math.min(t, bone.len) : t);
  return { t, d: Math.hypot(x - (bone.a.x + bone.ux * tt), y - (bone.a.y + bone.uy * tt)) };
}

/**
 * Rattache aux membres les pixels sombres du corps qui les touchent (sur `passes` pixels d'épaisseur),
 * sauf à la tête. @returns {number} pixels rattachés
 */
export function attachOutlines(base, rig, { darkLimit = 55, passes = 2, reset = null } = {}) {
  const { width: w, height: h } = rig;
  const d = base.data;
  const head = new Set(rig.parts.filter((p) => HEAD.test(p.name)).map((p) => p.id));
  let count = 0;
  for (let pass = 0; pass < passes; pass++) {
    const grab = [];
    for (let i = 0; i < w * h; i++) {
      if (rig.labels[i] !== BODY || !d[i * 4 + 3] || luminance(d, i) > darkLimit) continue;
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const l = rig.labels[ny * w + nx];
        if (l !== BODY && !head.has(l)) { grab.push([i, l]); break; }
      }
    }
    for (const [i, l] of grab) {
      rig.labels[i] = l;
      if (reset) reset[i] = 1;
    }
    count += grab.length;
  }
  return count;
}

/**
 * Découpe auto par croissance à l'intérieur du dessin (voir en tête de fichier). Les pixels déjà
 * attribués à la main ne bougent pas et servent de graines à leur pièce.
 * @param {Uint8Array|null} reset pixels d'un précédent découpage auto, rendus au corps d'abord (et notés à nouveau)
 * @returns {number} nombre de pixels attribués
 */
export function geodesicSkin(base, rig, reset = null, { darkLimit = 60, darkCost = 4, outlines = true, shrink = 0.75, clearance = 1 } = {}) {
  const { width: w, height: h } = rig;
  const d = base.data;
  const op = (i) => d[i * 4 + 3] > 0;
  if (reset) for (let i = 0; i < reset.length; i++) if (reset[i]) { rig.labels[i] = BODY; reset[i] = 0; }
  const bones = bonesOf(base, rig);
  if (!bones.length) return 0;
  const boneOf = new Map(bones.map((b) => [b.id, b]));
  // la tête d'un personnage reste près de son axe ; celle d'un animal (museau en avant, bois) s'étend librement
  const animal = rig.parts.some((p) => /^cuisse (avant|arrière)/i.test(p.name));
  const headIds = new Set(animal ? [] : rig.parts.filter((p) => HEAD.test(p.name)).map((p) => p.id));

  const N = w * h;
  const owner = new Int16Array(N).fill(-1);
  const dist = new Float32Array(N).fill(Infinity);
  const q = heap();
  const seed = (i, id) => {
    if (dist[i] === 0) return;
    owner[i] = id; dist[i] = 0; q.push(0, i);
  };

  // graines : les pixels peints à la main, puis les os, puis le torse
  for (let i = 0; i < N; i++) if (op(i) && rig.labels[i] !== BODY) seed(i, rig.labels[i]);
  for (const b of bones) {
    const len = b.capEnd ? b.len : b.len * 0.6;
    for (let t = 0; t <= len; t += 0.5) {
      const x = Math.floor(b.a.x + b.ux * t), y = Math.floor(b.a.y + b.uy * t);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (op(i) && rig.labels[i] === BODY) seed(i, b.id);
    }
  }
  const roots = rig.parts.filter((p) => p.id !== BODY && p.pivotSet !== false && (p.parent === BODY || p.parent == null));
  // le torse : l'enveloppe des pivots racines, resserrée vers son centre (les épaules et les hanches sont au bord du torse)
  const env = hull(roots.map((p) => p.pivot));
  const cx = env.reduce((a, p) => a + p.x, 0) / (env.length || 1), cy = env.reduce((a, p) => a + p.y, 0) / (env.length || 1);
  const torso = env.map((p) => ({ x: cx + (p.x - cx) * shrink, y: cy + (p.y - cy) * shrink }));
  if (torso.length >= 3) {
    for (let i = 0; i < N; i++) {
      if (!op(i) || rig.labels[i] !== BODY || dist[i] === 0) continue;
      const x = (i % w) + 0.5, y = ((i / w) | 0) + 0.5;
      if (!inside(torso, x, y)) continue;
      if (bones.every((b) => toBone(b, x, y).d > b.r * clearance)) seed(i, BODY);
    }
  }

  // croissance : le moins cher d'abord ; entrer dans un trait sombre coûte `darkCost` de plus
  while (q.size) {
    const [di, i] = q.pop();
    if (di > dist[i]) continue;
    const id = owner[i];
    const bone = boneOf.get(id);
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!op(j) || (rig.labels[j] !== BODY && rig.labels[j] !== id)) continue;
      // jamais en arrière de son articulation ; la tête reste près de son axe (sinon elle emporte le haut des épaules)
      if (bone && id !== BODY) {
        const tb = toBone(bone, nx + 0.5, ny + 0.5);
        if (tb.t < -1.5 || (headIds.has(id) && tb.d > bone.r * 0.7)) continue;
      }
      const nd = di + 1 + (luminance(d, j) < darkLimit ? darkCost : 0);
      if (nd < dist[j]) { dist[j] = nd; owner[j] = id; q.push(nd, j); }
    }
  }

  let count = 0;
  for (let i = 0; i < N; i++) {
    if (!op(i) || rig.labels[i] !== BODY || owner[i] <= BODY) continue;
    rig.labels[i] = owner[i];
    if (reset) reset[i] = 1;
    count++;
  }
  if (outlines) count += attachOutlines(base, rig, { reset });
  return count;
}
