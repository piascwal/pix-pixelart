// Propager un comblage : quand la découpe a laissé un trou (un objet devant le corps, par exemple) et qu'on l'a bouché à la
// main sur une image, le même trou se retrouve sur les autres images, à la même place du corps. Au lieu de le reboucher
// image par image, on recopie les pixels de comblage : le corps ne fait que se décaler d'une image à l'autre (rebond de la
// marche), donc un pixel du corps est au même endroit une fois ce décalage retiré.
//
// On ne recopie que ce qui est un comblage de trou : un pixel que la retouche a rempli alors qu'il était transparent et
// entouré d'opaque, et seulement sur un pixel également transparent et entouré d'opaque de l'image visée. Rien n'est
// peint par-dessus un membre ni dans le vide autour du personnage.

/** Le décalage du corps dans une pose (le corps ne tourne pas). */
export const bodyShift = (pose, bodyId = 0) => ({ dx: pose?.[bodyId]?.dx || 0, dy: pose?.[bodyId]?.dy || 0 });

const alphaAt = (img, x, y) => (x < 0 || y < 0 || x >= img.width || y >= img.height ? 0 : img.data[(y * img.width + x) * 4 + 3]);

/** Un pixel est « enfermé » s'il a de l'opaque de chaque côté, à moins de `maxGap` pixels, en largeur ou en hauteur. */
export function isEnclosed(img, x, y, maxGap = 6) {
  const seen = (dx, dy) => {
    for (let k = 1; k <= maxGap; k++) if (alphaAt(img, x + dx * k, y + dy * k)) return true;
    return false;
  };
  return (seen(-1, 0) && seen(1, 0)) || (seen(0, -1) && seen(0, 1));
}

/**
 * @param {{ width, height, data }} source image de départ SANS ses retouches
 * @param {Map<number, number[]>} edits retouches de l'image de départ (indice de pixel → [r, g, b, a])
 * @param {{ dx, dy }} from décalage du corps dans l'image de départ
 * @param {Array<{ image, shift: { dx, dy } }>} targets images visées (avec leurs retouches) et décalage de leur corps
 * @returns {Array<Map<number, number[]>>} pour chaque image visée, les retouches à ajouter
 */
export function propagateFills(source, edits, from, targets, { maxGap = 6 } = {}) {
  // les comblages : retouches opaques posées sur un trou de l'image de départ
  const fills = [];
  for (const [i, rgba] of edits) {
    if (!rgba[3]) continue;
    const x = i % source.width, y = (i - x) / source.width;
    if (source.data[i * 4 + 3] || !isEnclosed(source, x, y, maxGap)) continue;
    fills.push([x, y, rgba]);
  }
  return targets.map(({ image, shift }) => {
    const out = new Map();
    for (const [x, y, rgba] of fills) {
      const tx = x - from.dx + shift.dx, ty = y - from.dy + shift.dy;
      if (tx < 0 || ty < 0 || tx >= image.width || ty >= image.height) continue;
      if (alphaAt(image, tx, ty) || !isEnclosed(image, tx, ty, maxGap)) continue;
      out.set(ty * image.width + tx, rgba);
    }
    return out;
  });
}
