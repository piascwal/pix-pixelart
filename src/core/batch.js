// Traitement d'une image seule avec les réglages de l'interface, sans état :
// utilisé pour convertir toutes les images d'un lot. Chaque image a sa propre
// détection de grille et de fond ; le reste (couleurs, tolérance, nettoyage,
// taille choisie, règles de palette) vient des réglages communs.

import { analyze, convert } from './pipeline.js';
import { targetGrid } from './gridDetect.js';

const NO_BACKGROUND = { r: 0, g: 0, b: 0, transparent: true };

export function processWithSettings(image, s) {
  const { grid, background } = analyze(image);
  // taille choisie : la même pour tout le lot ; grille réglée à la main : idem ; sinon la détection de l'image
  const g = s.gridMode === 'target' ? targetGrid(image.width, image.height, s.targetSize)
    : s.gridLocked ? { period: s.period, offsetX: s.offsetX, offsetY: s.offsetY }
      : grid;
  return convert(image, {
    grid: { period: g.period, offsetX: g.offsetX, offsetY: g.offsetY },
    background: s.gridMode === 'target' && !s.removeBg ? NO_BACKGROUND : background,
    tolerance: s.tolerance,
    colors: Math.round(s.colors),
    paletteRules: s.paletteRules,
    cleanup: s.cleanup ? { isolated: true, minIsland: Math.round(s.minIsland), fillHoles: true } : null,
  });
}
