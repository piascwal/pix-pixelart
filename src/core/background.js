// Fond : couleur dominante du bord de l'image.
// Attention, sur les images d'IA le « magenta » n'est presque jamais #ff00ff
// (l'image de référence a un fond (167, 0, 132)) : on le mesure, on ne le
// suppose pas.

export const DEFAULT_TOLERANCE = 60;

/**
 * @returns {{ r: number, g: number, b: number, transparent: boolean }}
 *   transparent = l'image source a déjà un fond transparent.
 */
export function detectBackground(img, border = 2) {
  const { width: w, height: h, data: d } = img;
  const buckets = new Map();
  let total = 0;
  let clear = 0;

  const visit = (x, y) => {
    const i = (y * w + x) * 4;
    total++;
    if (d[i + 3] < 128) { clear++; return; }
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < border || y < border || x >= w - border || y >= h - border) visit(x, y);
    }
  }

  if (total === 0) return { r: 0, g: 0, b: 0, transparent: true };
  if (clear > total / 2 || buckets.size === 0) return { r: 0, g: 0, b: 0, transparent: true };

  let best = null;
  for (const list of buckets.values()) if (!best || list.length > best.length) best = list;
  const med = (c) => {
    const v = best.map((i) => d[i + c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  return { r: med(0), g: med(1), b: med(2), transparent: false };
}

/** Un pixel est du fond s'il est transparent ou à moins de `tolerance` (somme des |écarts| RVB). */
export function isBackgroundPixel(d, i, bg, tolerance = DEFAULT_TOLERANCE) {
  if (d[i + 3] < 128) return true;
  if (bg.transparent) return false;
  return Math.abs(d[i] - bg.r) + Math.abs(d[i + 1] - bg.g) + Math.abs(d[i + 2] - bg.b) < tolerance;
}
