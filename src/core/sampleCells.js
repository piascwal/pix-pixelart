// Une case de la grille → un pixel d'une seule couleur.
// Couleur = médiane par canal des pixels INTÉRIEURS de la case (on ignore
// 1 px de bord, là où l'IA a mis du flou), jamais un pixel isolé.

import { createImage } from './image.js';
import { isBackgroundPixel, DEFAULT_TOLERANCE } from './background.js';

const median = (arr, n) => {
  const v = arr.subarray(0, n).sort();
  return v[n >> 1];
};

/**
 * @param {import('./image.js').RGBAImage} img
 * @param {{ xs: number[], ys: number[] }} lines bords des cases (voir gridLines)
 * @param {{ r, g, b, transparent }} bg
 * @param {{ tolerance?: number, emptyRatio?: number }} opts
 *   emptyRatio : une case est vide si plus de cette part de ses pixels intérieurs est du fond.
 * @returns {import('./image.js').RGBAImage} une image de (xs.length-1) × (ys.length-1) pixels
 */
export function sampleCells(img, lines, bg, { tolerance = DEFAULT_TOLERANCE, emptyRatio = 0.5 } = {}) {
  const { xs, ys } = lines;
  const cols = Math.max(0, xs.length - 1);
  const rows = Math.max(0, ys.length - 1);
  const out = createImage(cols, rows);
  const { width: w, data: d } = img;

  let maxCell = 1;
  for (let i = 0; i < cols; i++) maxCell = Math.max(maxCell, xs[i + 1] - xs[i]);
  let maxRow = 1;
  for (let j = 0; j < rows; j++) maxRow = Math.max(maxRow, ys[j + 1] - ys[j]);
  const bufR = new Uint8Array(maxCell * maxRow);
  const bufG = new Uint8Array(maxCell * maxRow);
  const bufB = new Uint8Array(maxCell * maxRow);

  for (let j = 0; j < rows; j++) {
    const [ya, yb] = inset(ys[j], ys[j + 1]);
    for (let i = 0; i < cols; i++) {
      const [xa, xb] = inset(xs[i], xs[i + 1]);
      let n = 0;
      let background = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const p = (y * w + x) * 4;
          if (isBackgroundPixel(d, p, bg, tolerance)) { background++; continue; }
          bufR[n] = d[p]; bufG[n] = d[p + 1]; bufB[n] = d[p + 2];
          n++;
        }
      }
      const total = n + background;
      if (n === 0 || background > total * emptyRatio) continue; // case vide → transparente
      const o = (j * cols + i) * 4;
      out.data[o] = median(bufR, n);
      out.data[o + 1] = median(bufG, n);
      out.data[o + 2] = median(bufB, n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Intérieur d'une case : 1 px de marge de chaque côté si la case est assez grande. */
function inset(a, b) {
  return b - a >= 4 ? [a + 1, b - 1] : [a, b];
}
