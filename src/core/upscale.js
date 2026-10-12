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

/**
 * Pose l'image au centre d'une toile transparente carrée size × size, sans la
 * déformer ni la rééchantillonner (pas de perte). Une dimension impaire de
 * marge donne un pixel de plus en bas / à droite.
 */
export function padToCanvas(img, size) {
  if (img.width > size || img.height > size) {
    throw new RangeError(`L'image (${img.width} × ${img.height}) ne tient pas dans ${size} × ${size}.`);
  }
  const out = createImage(size, size);
  const x0 = (size - img.width) >> 1;
  const y0 = (size - img.height) >> 1;
  for (let y = 0; y < img.height; y++) {
    out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y0 + y) * size + x0) * 4);
  }
  return out;
}

/**
 * Toile carrée size × size où le sprite prend le plus de place possible sans être
 * coupé : on rogne les marges vides, on agrandit au plus proche voisin du plus grand
 * facteur ENTIER qui tient (les pixels restent des carrés parfaits), puis on centre.
 * @returns {{ image, scale, content: {w, h} }}
 */
export function fitToCanvas(img, size) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!img.data[(y * img.width + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = img.width - 1; y1 = img.height - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const scale = Math.floor(size / Math.max(w, h));
  if (scale < 1) throw new RangeError(`Le sprite (${w} × ${h}) ne tient pas dans ${size} × ${size}.`);
  const trimmed = createImage(w, h);
  for (let y = 0; y < h; y++) {
    trimmed.data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  }
  return { image: padToCanvas(upscale(trimmed, scale), size), scale, content: { w, h } };
}

/** Plus grand côté du sprite (marges transparentes exclues) : la plus petite toile qui le contient. */
export function contentSize(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!img.data[(y * img.width + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? Math.max(img.width, img.height) : Math.max(x1 - x0 + 1, y1 - y0 + 1);
}
