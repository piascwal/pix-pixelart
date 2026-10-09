// Objet image du cœur : { width, height, data: Uint8ClampedArray RGBA }.
// Compatible ImageData, mais jamais lié au DOM : tout le cœur tourne aussi
// sous Node (tests) et dans le Web Worker.

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} RGBAImage */

/** @returns {RGBAImage} une image transparente */
export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** @returns {RGBAImage} */
export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Rogne l'image à la boîte englobante de ses pixels opaques. */
export function trimTransparent(img) {
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { image: createImage(0, 0), x: 0, y: 0 };
  return { image: crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1), x: x0, y: y0 };
}

export function crop(img, x0, y0, w, h) {
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

export const packRGB = (r, g, b) => (r << 16) | (g << 8) | b;
export const unpackRGB = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
