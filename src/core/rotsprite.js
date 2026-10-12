// Rotation de pixel art façon RotSprite (simplifié) : une rotation classique
// casse les pixels (trous, escaliers, couleurs mélangées). On agrandit d'abord
// ×8 avec Scale2x (trois passes), qui arrondit les diagonales sans inventer de
// couleur, on tourne au plus proche voisin, puis on prend le centre de chaque
// bloc 8×8. Résultat : des pixels nets, et uniquement des couleurs d'origine.

import { createImage } from './image.js';

const u32 = (img) => (img.data.byteOffset % 4 === 0
  ? new Uint32Array(img.data.buffer, img.data.byteOffset, img.width * img.height)
  : new Uint32Array(new Uint8ClampedArray(img.data).buffer));

/** Scale2x (EPX) : ×2, les coins des formes s'arrondissent, aucune couleur nouvelle. */
export function scale2x(img) {
  const { width: w, height: h } = img;
  const src = u32(img);
  const out = createImage(w * 2, h * 2);
  const dst = new Uint32Array(out.data.buffer);
  const W2 = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const P = src[i];
      const A = y > 0 ? src[i - w] : P;        // haut
      const B = x < w - 1 ? src[i + 1] : P;    // droite
      const C = x > 0 ? src[i - 1] : P;        // gauche
      const D = y < h - 1 ? src[i + w] : P;    // bas
      const o = 2 * y * W2 + 2 * x;
      dst[o] = C === A && C !== D && A !== B ? A : P;
      dst[o + 1] = A === B && A !== C && B !== D ? B : P;
      dst[o + W2] = D === C && D !== B && C !== A ? C : P;
      dst[o + W2 + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out;
}

/** Boîte des pixels opaques, ou null. */
export function opaqueBounds(img) {
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!d[(y * w + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Dessine `piece` dans `out` : rotation de `angle` degrés (sens horaire à l'écran)
 * autour de `pivot`, puis le pivot amené en `dest`. Coordonnées continues : le
 * centre du pixel (x, y) est (x + 0,5 ; y + 0,5). Les pixels transparents de la
 * pièce ne recouvrent rien. Renvoie la liste des indices de pixels écrits.
 */
export function drawRotated(out, piece, { pivot, angle = 0, dest = pivot }) {
  const b = opaqueBounds(piece);
  const written = [];
  if (!b) return written;
  const { width: W, height: H } = out;
  const od = out.data;
  const pd = piece.data;

  // pas de rotation et décalage entier : copie exacte, pixel pour pixel
  const tx = dest.x - pivot.x;
  const ty = dest.y - pivot.y;
  if (Math.abs(angle % 360) < 1e-9 && Number.isInteger(tx) && Number.isInteger(ty)) {
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const s = (y * piece.width + x) * 4;
        if (!pd[s + 3]) continue;
        const X = x + tx, Y = y + ty;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const o = (Y * W + X) * 4;
        od[o] = pd[s]; od[o + 1] = pd[s + 1]; od[o + 2] = pd[s + 2]; od[o + 3] = pd[s + 3];
        written.push(Y * W + X);
      }
    }
    return written;
  }

  // pièce recadrée (1 px de marge) puis agrandie ×8 par Scale2x
  const cx0 = b.x0 - 1, cy0 = b.y0 - 1;
  const cw = b.x1 - b.x0 + 2, chh = b.y1 - b.y0 + 2;
  const crop = createImage(cw, chh);
  for (let y = b.y0; y < b.y1; y++) {
    const from = (y * piece.width + b.x0) * 4;
    crop.data.set(pd.subarray(from, from + (b.x1 - b.x0) * 4), ((y - cy0) * cw + 1) * 4);
  }
  const up = scale2x(scale2x(scale2x(crop)));
  const ud = up.data;

  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  // boîte de destination : les coins de la pièce transformés
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const [px, py] of [[cx0, cy0], [cx0 + cw, cy0], [cx0, cy0 + chh], [cx0 + cw, cy0 + chh]]) {
    const dx = px - pivot.x, dy = py - pivot.y;
    const X = dest.x + dx * ca - dy * sa;
    const Y = dest.y + dx * sa + dy * ca;
    X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y);
  }
  const xs = Math.max(0, Math.floor(X0) - 1), xe = Math.min(W, Math.ceil(X1) + 1);
  const ys = Math.max(0, Math.floor(Y0) - 1), ye = Math.min(H, Math.ceil(Y1) + 1);
  for (let Y = ys; Y < ye; Y++) {
    for (let X = xs; X < xe; X++) {
      // rotation inverse du centre du pixel de destination
      const dx = X + 0.5 - dest.x, dy = Y + 0.5 - dest.y;
      const sx = pivot.x + dx * ca + dy * sa;
      const sy = pivot.y - dx * sa + dy * ca;
      const ux = Math.floor((sx - cx0) * 8), uy = Math.floor((sy - cy0) * 8);
      if (ux < 0 || uy < 0 || ux >= up.width || uy >= up.height) continue;
      const s = (uy * up.width + ux) * 4;
      if (!ud[s + 3]) continue;
      const o = (Y * W + X) * 4;
      od[o] = ud[s]; od[o + 1] = ud[s + 1]; od[o + 2] = ud[s + 2]; od[o + 3] = ud[s + 3];
      written.push(Y * W + X);
    }
  }
  return written;
}
