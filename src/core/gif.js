// Encodeur GIF animé (GIF89a), sans dépendance.
//  - palette globale commune à toutes les images (≤ 255 couleurs + 1 transparente) ;
//    au-delà, quantification median cut ;
//  - transparence à 1 bit, chaque image est effacée avant la suivante (disposal 2) ;
//  - boucle infinie, durée par image en centièmes de seconde.

import { colorHistogram, medianCut, nearestIndex } from './palette.js';
import { unpackRGB } from './image.js';

const MAX_COLORS = 255;   // l'indice 0 est réservé à la transparence

/** Palette commune : couleurs exactes si elles tiennent, sinon median cut. */
export function buildPalette(images) {
  const hist = new Map();
  for (const img of images) {
    for (const [c, n] of colorHistogram(img)) hist.set(c, (hist.get(c) || 0) + n);
  }
  if (hist.size <= MAX_COLORS) return { colors: [...hist.keys()].map(unpackRGB), exact: true };
  return { colors: medianCut(hist, MAX_COLORS), exact: false };
}

/** Compression LZW du GIF (codes de 3 à 12 bits, table réinitialisée quand elle est pleine). */
export function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code, size) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  emit(clear, codeSize);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear, codeSize);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix, codeSize);
  emit(eoi, codeSize);
  if (bits > 0) out.push(cur & 255);
  return out;
}

const u16 = (n) => [n & 255, (n >> 8) & 255];

/**
 * @param {Array<{width, height, data}>} images même taille
 * @param {{ delayMs?: number | number[], loop?: number }} opts  loop 0 = infini
 * @returns {Uint8Array}
 */
export function encodeGif(images, { delayMs = 100, loop = 0 } = {}) {
  const { width, height } = images[0];
  const { colors, exact } = buildPalette(images);
  const table = new Map();   // couleur → indice (palette exacte)
  colors.forEach((c, i) => table.set((c[0] << 16) | (c[1] << 8) | c[2], i + 1));
  const cache = new Map();   // quantification : couleur → indice
  const indexOf = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    if (exact) return table.get(key);
    let i = cache.get(key);
    if (i === undefined) cache.set(key, (i = nearestIndex(colors, r, g, b) + 1));
    return i;
  };

  // table globale : indice 0 = transparent (noir), puis les couleurs, complétée à 2^n
  let bitsTable = 1;
  while ((1 << bitsTable) < colors.length + 1) bitsTable++;
  const tableSize = 1 << bitsTable;
  const bytes = [];
  const push = (arr) => { for (const b of arr) bytes.push(b); };

  push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);                       // GIF89a
  push([...u16(width), ...u16(height), 0x80 | 0x70 | (bitsTable - 1), 0, 0]);
  push([0, 0, 0]);
  for (let i = 0; i < tableSize - 1; i++) push(colors[i] || [0, 0, 0]);
  push([0x21, 0xff, 0x0b, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, ...u16(loop), 0]);

  const minCode = Math.max(2, bitsTable);
  images.forEach((img, f) => {
    const ms = Array.isArray(delayMs) ? delayMs[f] ?? delayMs[delayMs.length - 1] : delayMs;
    const cs = Math.max(2, Math.round(ms / 10));                    // les navigateurs ralentissent < 2 cs
    push([0x21, 0xf9, 4, (2 << 2) | 1, ...u16(cs), 0, 0]);          // disposal 2, couleur transparente = 0
    push([0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0]);
    const idx = new Uint8Array(width * height);
    const d = img.data;
    for (let i = 0; i < idx.length; i++) {
      idx[i] = d[i * 4 + 3] < 128 ? 0 : indexOf(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    }
    bytes.push(minCode);
    const lzw = lzwEncode(idx, minCode);
    for (let p = 0; p < lzw.length; p += 255) {
      const chunk = lzw.slice(p, p + 255);
      bytes.push(chunk.length);
      push(chunk);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
