// Cadrage : la zone qui compte vraiment dans un résultat.
// La boîte englobante brute est faussée par la moindre poussière isolée à
// l'autre bout de l'image ; on ignore donc les petits îlots (connexité à 8
// voisins, pour ne pas séparer un trait en diagonale).

/**
 * @param {import('./image.js').RGBAImage} img
 * @returns {{ x0: number, y0: number, x1: number, y1: number }} x1 et y1 exclus
 */
export function focusBounds(img, { minRatio = 0.002, minPixels = 4 } = {}) {
  const { width: w, height: h, data: d } = img;
  const full = { x0: 0, y0: 0, x1: w, y1: h };
  const seen = new Uint8Array(w * h);
  const islands = [];
  let filled = 0;
  const stack = [];

  for (let start = 0; start < w * h; start++) {
    if (seen[start] || d[start * 4 + 3] === 0) continue;
    const island = { size: 0, x0: w, y0: h, x1: 0, y1: 0 };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      island.size++;
      if (x < island.x0) island.x0 = x;
      if (x + 1 > island.x1) island.x1 = x + 1;
      if (y < island.y0) island.y0 = y;
      if (y + 1 > island.y1) island.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (seen[q] || d[q * 4 + 3] === 0) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    filled += island.size;
    islands.push(island);
  }
  if (!islands.length) return full;

  const threshold = Math.max(minPixels, Math.ceil(minRatio * filled));
  const kept = islands.filter((i) => i.size >= threshold);
  const used = kept.length ? kept : islands;
  return {
    x0: Math.min(...used.map((i) => i.x0)),
    y0: Math.min(...used.map((i) => i.y0)),
    x1: Math.max(...used.map((i) => i.x1)),
    y1: Math.max(...used.map((i) => i.y1)),
  };
}
