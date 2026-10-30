// Finition d'une image d'animation : ce que la découpe et la rotation laissent derrière elles.
//   - pixels seuls : opaques sans aucun voisin opaque (4-voisinage) ;
//   - îlots : petits groupes de pixels détachés du personnage (bout de membre arraché) ;
//   - trous : petits groupes de pixels transparents enfermés dans le personnage (jusqu'à
//     `maxHole` pixels), bouchés de proche en proche avec la couleur majoritaire des voisins.
// Le vide autour du personnage, lui, n'est jamais rempli : un trou qui touche le bord de
// l'image ou dépasse `maxHole` pixels est laissé tel quel.

import { cloneImage } from './image.js';
import { removeIsolated, removeSmallIslands } from './cleanup.js';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Bouche les groupes de pixels transparents enfermés d'au plus `maxHole` pixels. */
export function fillSmallHoles(img, maxHole = 3) {
  const out = cloneImage(img);
  const { width: w, height: h } = img;
  const d = out.data;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || d[start * 4 + 3]) continue;
    // le groupe transparent qui contient `start`
    const group = [start];
    seen[start] = 1;
    let open = false;
    for (let k = 0; k < group.length; k++) {
      const p = group[k];
      const x = p % w, y = (p - x) / w;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { open = true; continue; }
        const q = ny * w + nx;
        if (seen[q] || d[q * 4 + 3]) continue;
        seen[q] = 1;
        group.push(q);
      }
    }
    if (open || group.length > maxHole) continue;
    // de proche en proche : chaque pixel prend la couleur la plus fréquente de ses voisins déjà pleins
    let left = group;
    while (left.length) {
      const next = [];
      const fills = [];
      for (const p of left) {
        const x = p % w, y = (p - x) / w;
        const votes = new Map();
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const o = (ny * w + nx) * 4;
          if (!d[o + 3]) continue;
          const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
          votes.set(key, (votes.get(key) || 0) + 1);
        }
        if (!votes.size) { next.push(p); continue; }
        let key = 0, best = 0;
        for (const [k, v] of votes) if (v > best) { best = v; key = k; }
        fills.push([p, key]);
      }
      if (!fills.length) break;
      for (const [p, key] of fills) d.set([(key >> 16) & 255, (key >> 8) & 255, key & 255, 255], p * 4);
      left = next;
    }
  }
  return out;
}

/**
 * @param {{ minIsland?: number, maxHole?: number }} opts
 * @returns {{ width, height, data }} une nouvelle image
 */
export function polishFrame(img, { minIsland = 6, maxHole = 3 } = {}) {
  let out = removeIsolated(img, 1);
  if (minIsland > 1) out = removeSmallIslands(out, minIsland);
  if (maxHole > 0) out = fillSmallHoles(out, maxHole);
  return out;
}
