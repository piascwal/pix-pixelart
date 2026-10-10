// Chaîne complète : faux pixel art → vrai pixel art.
//
//   analyze(image)          détection grille + fond (le plus coûteux, fait une fois)
//   convert(image, options) échantillonnage → rognage → palette → nettoyage
//
// Points d'extension prévus (hors v1) :
//   - grilles qui dérivent : remplacer gridLines() par un recalage ligne par
//     ligne qui produit des bords irréguliers ; sampleCells les accepte déjà ;
//   - traitement par lot : appeler depix() en boucle (fonctions pures) ;
//   - planche de sprites : découper le résultat par composantes connexes.

import { detectGrid, gridLines } from './gridDetect.js';
import { detectBackground, DEFAULT_TOLERANCE } from './background.js';
import { sampleCells } from './sampleCells.js';
import { colorHistogram, medianCut, applyPalette, resolvePalette, EMPTY_RULES, DEFAULT_COLORS } from './palette.js';
import { cleanup as cleanupImage } from './cleanup.js';
import { trimTransparent, toHex } from './image.js';
import { focusBounds } from './frame.js';

export const DEFAULT_OPTIONS = Object.freeze({
  tolerance: DEFAULT_TOLERANCE, // distance RVB (somme des |écarts|) en dessous de laquelle c'est du fond
  emptyRatio: 0.5,              // une case est vide si plus de la moitié de son intérieur est du fond
  colors: DEFAULT_COLORS,
  paletteRules: EMPTY_RULES,    // exclusions / remplacements manuels (voir resolvePalette)
  cleanup: { isolated: true, minIsland: 4, fillHoles: true }, // null pour désactiver
  trim: true,
});

export function analyze(img) {
  return { grid: detectGrid(img), background: detectBackground(img) };
}

/**
 * @param {import('./image.js').RGBAImage} img
 * @param {{ grid: {period, offsetX, offsetY}, background: object } & Partial<typeof DEFAULT_OPTIONS>} options
 * @returns {{ image, palette, lines: { xs, ys }, focus, stats }}
 *   palette : la palette complète (avant choix manuels) ; focus : zone du sprite
 *   en cases { x0, y0, x1, y1 } (x1, y1 exclus), sans les petites poussières
 *   lines : bords en pixels source de chaque colonne / ligne du résultat
 *   (lines.xs[i]..lines.xs[i+1] = colonne i), pour superposer avant / après.
 */
export function convert(img, options) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const all = gridLines(o.grid, img.width, img.height);
  let cells = sampleCells(img, all, o.background, { tolerance: o.tolerance, emptyRatio: o.emptyRatio });

  const palette = medianCut(colorHistogram(cells), o.colors);
  const targets = resolvePalette(palette, o.paletteRules);
  let image = applyPalette(cells, palette, targets);
  if (o.cleanup) image = cleanupImage(image, o.cleanup);

  let x = 0;
  let y = 0;
  if (o.trim) ({ image, x, y } = trimTransparent(image));
  const lines = {
    xs: all.xs.slice(x, x + image.width + 1),
    ys: all.ys.slice(y, y + image.height + 1),
  };

  let filled = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]) filled++;
  return {
    image,
    palette,
    lines,
    focus: focusBounds(image),
    stats: { width: image.width, height: image.height, filled, colors: new Set(targets.map(toHex)).size },
  };
}

/** Tout-en-un : les réglages manuels (period, offsetX, offsetY) priment sur la détection. */
export function depix(img, options = {}) {
  const auto = analyze(img);
  const grid = {
    period: options.period ?? auto.grid.period,
    offsetX: options.offsetX ?? auto.grid.offsetX,
    offsetY: options.offsetY ?? auto.grid.offsetY,
  };
  return { ...convert(img, { ...options, grid, background: options.background ?? auto.background }), detected: auto };
}
