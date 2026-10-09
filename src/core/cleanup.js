// Nettoyage optionnel du résultat (en 4-voisinage) :
//  - pixels isolés : opaques avec moins de 2 voisins opaques ;
//  - îlots : groupes connexes de moins de N pixels opaques ;
//  - trous d'1 px : pixel transparent entouré de 4 voisins opaques.

import { cloneImage } from './image.js';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const opaque = (img, x, y) =>
  x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] !== 0;

export function removeIsolated(img, minNeighbors = 2) {
  const out = cloneImage(img);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!opaque(img, x, y)) continue;
      let n = 0;
      for (const [dx, dy] of NEIGHBORS) if (opaque(img, x + dx, y + dy)) n++;
      if (n < minNeighbors) out.data[(y * img.width + x) * 4 + 3] = 0;
    }
  }
  return out;
}

export function removeSmallIslands(img, minSize) {
  const out = cloneImage(img);
  if (minSize <= 1) return out;
  const { width: w, height: h } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || img.data[start * 4 + 3] === 0) continue;
    const island = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      island.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!opaque(img, nx, ny)) continue;
        const q = ny * w + nx;
        if (!seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (island.length < minSize) for (const p of island) out.data[p * 4 + 3] = 0;
  }
  return out;
}

export function fillPinholes(img) {
  const out = cloneImage(img);
  const { width: w, data: d } = img;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(img, x, y)) continue;
      if (!NEIGHBORS.every(([dx, dy]) => opaque(img, x + dx, y + dy))) continue;
      // couleur la plus fréquente parmi les 4 voisins
      const votes = new Map();
      for (const [dx, dy] of NEIGHBORS) {
        const i = ((y + dy) * w + x + dx) * 4;
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        votes.set(key, (votes.get(key) || 0) + 1);
      }
      let key = 0;
      let best = 0;
      for (const [k, v] of votes) if (v > best) { best = v; key = k; }
      const o = (y * w + x) * 4;
      out.data[o] = (key >> 16) & 255;
      out.data[o + 1] = (key >> 8) & 255;
      out.data[o + 2] = key & 255;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * @param {{ isolated?: boolean, minIsland?: number, fillHoles?: boolean }} opts
 */
export function cleanup(img, { isolated = true, minIsland = 4, fillHoles = true } = {}) {
  let out = img;
  if (isolated) out = removeIsolated(out);
  if (minIsland > 1) out = removeSmallIslands(out, minIsland);
  if (fillHoles) out = fillPinholes(out);
  return out;
}
