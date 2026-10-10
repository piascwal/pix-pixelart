// Palette limitée : quantification « median cut », sans tramage.
// On découpe récursivement le nuage de couleurs (pondéré par le nombre de
// pixels) le long de son canal le plus dispersé, en commençant toujours par
// la boîte qui concentre le plus d'erreur.

import { packRGB, unpackRGB, toHex } from './image.js';

export const DEFAULT_COLORS = 48;

/** Histogramme des couleurs opaques : Map<rgbEntier, nombre>. */
export function colorHistogram(img) {
  const hist = new Map();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const c = packRGB(d[i], d[i + 1], d[i + 2]);
    hist.set(c, (hist.get(c) || 0) + 1);
  }
  return hist;
}

function makeBox(entries) {
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  let count = 0;
  for (const e of entries) {
    for (let c = 0; c < 3; c++) {
      sum[c] += e.rgb[c] * e.count;
      sq[c] += e.rgb[c] * e.rgb[c] * e.count;
    }
    count += e.count;
  }
  const mean = sum.map((s) => s / count);
  // erreur (somme des carrés) par canal : on coupe le long du plus dispersé
  const sse = sq.map((q, c) => q - sum[c] * mean[c]);
  let axis = 0;
  for (let c = 1; c < 3; c++) if (sse[c] > sse[axis]) axis = c;
  return { entries, count, mean, axis, error: sse[0] + sse[1] + sse[2], splittable: entries.length > 1 };
}

/**
 * Coupe la boîte le long de son axe principal. Le point de coupe classique est
 * la médiane ; on le déplace là où les deux moitiés sont les mieux séparées
 * (variance inter-classes maximale), pour ne pas couper un aplat en deux et
 * fusionner à sa place deux teintes franches.
 */
function splitBox(box) {
  const { axis } = box;
  const sorted = [...box.entries].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
  let n1 = 0;
  let s1 = 0;
  const total = box.mean[axis] * box.count;
  let cut = 1;
  let best = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    n1 += sorted[i].count;
    s1 += sorted[i].rgb[axis] * sorted[i].count;
    if (sorted[i].rgb[axis] === sorted[i + 1].rgb[axis]) continue;
    const n2 = box.count - n1;
    const gap = s1 / n1 - (total - s1) / n2;
    const score = n1 * n2 * gap * gap;
    if (score > best) { best = score; cut = i + 1; }
  }
  return [makeBox(sorted.slice(0, cut)), makeBox(sorted.slice(cut))];
}

/**
 * @param {Map<number, number>} hist histogramme (colorHistogram)
 * @param {number} n nombre de couleurs voulu
 * @returns {Array<[number, number, number]>} palette triée par luminance
 */
export function medianCut(hist, n) {
  const entries = [...hist].map(([c, count]) => ({ rgb: unpackRGB(c), count }));
  if (entries.length === 0) return [];
  if (entries.length <= n) return sortByLuma(entries.map((e) => e.rgb));

  const boxes = [makeBox(entries)];
  while (boxes.length < n) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].splittable && (pick < 0 || boxes[i].error > boxes[pick].error)) pick = i;
    }
    if (pick < 0) break;
    boxes.splice(pick, 1, ...splitBox(boxes[pick]));
  }
  const colors = boxes.map((b) => b.mean.map(Math.round));
  // deux boîtes peuvent donner la même moyenne arrondie
  const unique = [...new Map(colors.map((c) => [packRGB(...c), c])).values()];
  return sortByLuma(unique);
}

const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const sortByLuma = (colors) => colors.sort((a, b) => luma(a) - luma(b));

/** Couleur de la palette la plus proche (distance euclidienne RVB). */
export function nearestIndex(palette, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestD) { bestD = dist; best = i; }
  }
  return best;
}

/**
 * Remplace chaque pixel opaque par la couleur de palette la plus proche (sans
 * tramage). `targets[i]` (par défaut palette[i]) est la couleur finalement
 * écrite pour la couleur i : voir resolvePalette.
 */
export function applyPalette(img, palette, targets = palette) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  if (!palette.length) return out;
  const cache = new Map();
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = packRGB(d[i], d[i + 1], d[i + 2]);
    let idx = cache.get(key);
    if (idx === undefined) cache.set(key, (idx = nearestIndex(palette, d[i], d[i + 1], d[i + 2])));
    [d[i], d[i + 1], d[i + 2]] = targets[idx];
  }
  return out;
}

/** Palette effectivement utilisée par une image (après retouches par exemple). */
export function usedColors(img) {
  return sortByLuma([...colorHistogram(img).keys()].map(unpackRGB));
}

/**
 * Choix manuels sur la palette, par code hexa (« #rrggbb ») :
 *   excluded : couleurs à ne pas utiliser (leurs pixels prennent la couleur
 *              restante la plus proche) ;
 *   replace  : { '#a': '#b' } la couleur a est remplacée par la couleur b.
 * Un remplacement l'emporte sur une exclusion de la même couleur.
 */
export const EMPTY_RULES = Object.freeze({ excluded: Object.freeze([]), replace: Object.freeze({}) });

/**
 * Couleur finale de chaque couleur de la palette une fois les choix appliqués.
 * Les règles qui visent une couleur absente de la palette sont ignorées
 * (la palette change quand on change le nombre de couleurs ou la grille).
 * @returns {Array<[number, number, number]>} targets, de même longueur que palette
 */
export function resolvePalette(palette, rules = EMPTY_RULES) {
  const excluded = new Set(rules.excluded || []);
  const replace = rules.replace || {};
  const byHex = new Map(palette.map((c) => [toHex(c), c]));
  let active = palette.filter((c) => !excluded.has(toHex(c)));
  if (!active.length) { excluded.clear(); active = palette; } // jamais de palette vide
  return palette.map((color) => {
    let hex = toHex(color);
    // suit les remplacements (A → B → C), avec garde-fou contre les cycles
    for (let step = 0; step < palette.length; step++) {
      const next = replace[hex];
      if (!next || next === hex || !byHex.has(next)) break;
      hex = next;
    }
    if (!excluded.has(hex)) return byHex.get(hex);
    const [r, g, b] = byHex.get(hex);
    return active[nearestIndex(active, r, g, b)];
  });
}
