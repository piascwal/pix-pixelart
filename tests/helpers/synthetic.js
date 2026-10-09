// Fabrique de faux pixel art pour les tests unitaires : un petit sprite
// agrandi à `period` px par case, posé sur un fond, éventuellement bruité.

import { createImage } from '../../src/core/image.js';

/** Générateur pseudo-aléatoire reproductible. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * @param {Array<Array<[r,g,b]|null>>} sprite lignes de cases (null = fond)
 */
export function fakePixelArt(sprite, {
  period = 6, offsetX = 0, offsetY = 0, width, height, bg = [167, 0, 132], noise = 0, seed = 1,
} = {}) {
  const rows = sprite.length;
  const cols = sprite[0].length;
  width ??= Math.ceil(offsetX + cols * period + period);
  height ??= Math.ceil(offsetY + rows * period + period);
  const img = createImage(width, height);
  const rand = rng(seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.floor((x - offsetX) / period);
      const cy = Math.floor((y - offsetY) / period);
      const cell = cx >= 0 && cy >= 0 && cx < cols && cy < rows ? sprite[cy][cx] : null;
      const color = cell || bg;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = color[c] + (noise ? (rand() - 0.5) * 2 * noise : 0);
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/** Sprite aléatoire plein de `cols` × `rows` cases avec quelques couleurs franches. */
export function randomSprite(cols, rows, seed = 3) {
  const colors = [[250, 250, 250], [20, 20, 30], [230, 60, 40], [30, 90, 200], [226, 178, 140], [60, 160, 70]];
  const rand = rng(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => colors[Math.floor(rand() * colors.length)]));
}

export const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [...img.data.subarray(i, i + 4)];
};
