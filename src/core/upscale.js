// Agrandissement au PLUS PROCHE VOISIN, uniquement pour l'export :
// chaque pixel devient un carré factor × factor de la même couleur.

import { createImage } from './image.js';

export const MAGENTA = [255, 0, 255];

export function upscale(img, factor) {
  const f = Math.max(1, Math.floor(factor));
  const out = createImage(img.width * f, img.height * f);
  const src = new Uint32Array(img.data.buffer, img.data.byteOffset, img.width * img.height);
  const dst = new Uint32Array(out.data.buffer);
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / f) * img.width;
    for (let x = 0; x < out.width; x++) dst[y * out.width + x] = src[sy + Math.floor(x / f)];
  }
  return out;
}

/** Remplace la transparence par une couleur unie opaque (magenta #ff00ff par défaut). */
export function flatten(img, [r, g, b] = MAGENTA) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] !== 0) { d[i + 3] = 255; continue; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return out;
}
