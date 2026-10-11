// Détection de la grille : taille du « gros pixel » (période) et décalage.
//
// On mesure l'énergie des gradients par colonne et par ligne : dans un faux
// pixel art, les bords de cases forment des pics réguliers. L'autocorrélation
// donne la période entière, un peigne affine ensuite la période (au 1/200e de
// pixel) et le décalage (au quart de pixel).
//
// Une grille est décrite par { period, offsetX, offsetY }. Le reste de la
// chaîne ne voit que des listes de bords de cases (gridLines) : une détection
// future de grilles qui dérivent n'aura qu'à produire des bords irréguliers.

export const MIN_PERIOD = 3;
export const MAX_PERIOD = 20;

/**
 * Énergie des gradients : col[x] = Σ_y |I(x,y) − I(x−1,y)| (somme des 3
 * canaux), donc col[x] est fort quand une case commence à la colonne x.
 */
export function gradientEnergy(img) {
  const { width: w, height: h, data: d } = img;
  const col = new Float64Array(w);
  const row = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x > 0) {
        const j = i - 4;
        col[x] += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
      }
      if (y > 0) {
        const j = i - w * 4;
        row[y] += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
      }
    }
  }
  return { col, row };
}

/** Retire la tendance lente (moyenne glissante) pour ne garder que la partie périodique. */
function highPass(signal, radius) {
  const n = signal.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + signal[i];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    out[i] = signal[i] - (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

/** Autocorrélation normalisée pour les décalages entiers minP..maxP. */
export function autocorrelation(signal, minP = MIN_PERIOD, maxP = MAX_PERIOD) {
  const s = highPass(signal, maxP);
  let energy = 0;
  for (const v of s) energy += v * v;
  const ac = new Float64Array(maxP + 2);
  if (energy === 0) return ac;
  for (let p = Math.max(1, minP - 1); p <= maxP + 1 && p < s.length; p++) {
    let sum = 0;
    for (let i = 0; i + p < s.length; i++) sum += s[i] * s[i + p];
    ac[p] = (sum / (s.length - p)) / (energy / s.length);
  }
  return ac;
}

/**
 * Score d'un peigne de période P et de décalage off : énergie moyenne sur les
 * bords de cases, rapportée à l'énergie moyenne du signal (1 = pas de grille).
 */
function combScore(signal, mean, period, offset) {
  let sum = 0;
  let count = 0;
  for (let pos = offset; pos < signal.length; pos += period) {
    const i = Math.round(pos);
    if (i < 1 || i >= signal.length) continue;
    sum += signal[i];
    count++;
  }
  return count && mean ? sum / count / mean : 0;
}

const meanOf = (s) => { let t = 0; for (const v of s) t += v; return s.length ? t / s.length : 0; };

/** Meilleur décalage (pas de 0,25 px) pour une période donnée. */
export function bestOffset(signal, period, step = 0.25) {
  const mean = meanOf(signal);
  let best = { offset: 0, score: -Infinity };
  for (let off = 0; off < period - 1e-9; off += step) {
    const score = combScore(signal, mean, period, off);
    if (score > best.score) best = { offset: off, score };
  }
  return best;
}

/** Période entière : la plus petite période « forte » (les multiples ressortent aussi). */
export function integerPeriod(energy, minP = MIN_PERIOD, maxP = MAX_PERIOD) {
  const ax = autocorrelation(energy.col, minP, maxP);
  const ay = autocorrelation(energy.row, minP, maxP);
  const ac = ax.map((v, i) => (v + ay[i]) / 2);
  const peaks = [];
  for (let p = minP; p <= maxP; p++) {
    if (ac[p] > 0 && ac[p] >= ac[p - 1] && ac[p] >= ac[p + 1]) peaks.push({ period: p, strength: ac[p] });
  }
  if (!peaks.length) return { period: null, strength: 0, peaks };
  const best = Math.max(...peaks.map((c) => c.strength));
  const chosen = peaks.find((c) => c.strength >= 0.6 * best);
  return { period: chosen.period, strength: chosen.strength, peaks };
}

const axesScore = (energy, p) => bestOffset(energy.col, p, 0.5).score + bestOffset(energy.row, p, 0.5).score;

/**
 * Affine une période à ±radius px en maximisant le peigne sur les deux axes.
 * À score quasi égal, on garde la valeur la plus proche du point de départ
 * (le bruit ne doit pas transformer 8 en 7,985).
 */
export function refinePeriod(energy, period, radius = 0.5, step = 0.005) {
  const candidates = [];
  for (let p = period - radius; p <= period + radius + 1e-9; p += step) {
    if (p >= MIN_PERIOD - 0.5) candidates.push({ period: p, score: axesScore(energy, p) });
  }
  const max = Math.max(...candidates.map((c) => c.score));
  const near = candidates.filter((c) => c.score >= max * 0.995)
    .sort((a, b) => Math.abs(a.period - period) - Math.abs(b.period - period))[0];
  return { period: Math.round(near.period * 1000) / 1000, score: near.score };
}

/**
 * L'autocorrélation ne voit que des périodes entières : une grille de 5,5 px
 * ressort à 11. On essaie donc les diviseurs de la période trouvée et on garde
 * le plus petit dont le peigne est presque aussi bon.
 */
export function bestPeriod(energy, integer) {
  let best = refinePeriod(energy, integer);
  for (const k of [2, 3, 4]) {
    const sub = integer / k;
    if (sub < MIN_PERIOD - 0.25) break;
    const cand = refinePeriod(energy, sub, 0.25);
    if (cand.score >= 0.9 * best.score && cand.period < best.period) best = cand;
  }
  return best.period;
}

/**
 * Détection complète.
 * @returns {{ period: number, offsetX: number, offsetY: number, confidence: number, peaks: Array }}
 */
export function detectGrid(img, { minPeriod = MIN_PERIOD, maxPeriod = MAX_PERIOD } = {}) {
  const energy = gradientEnergy(img);
  const coarse = integerPeriod(energy, minPeriod, maxPeriod);
  if (!coarse.period) {
    return { period: 8, offsetX: 0, offsetY: 0, confidence: 0, peaks: coarse.peaks };
  }
  const period = bestPeriod(energy, coarse.period);
  return {
    period,
    offsetX: bestOffset(energy.col, period).offset,
    offsetY: bestOffset(energy.row, period).offset,
    confidence: Math.max(0, Math.min(1, coarse.strength)),
    peaks: coarse.peaks,
  };
}

/** Bords des cases le long d'un axe, rognés à [0, length]. */
function axisLines(length, period, offset) {
  const lines = [];
  let k = Math.floor(-offset / period);
  for (;; k++) {
    const a = Math.round(offset + k * period);
    const b = Math.round(offset + (k + 1) * period);
    if (a >= length) break;
    const ca = Math.max(0, a);
    const cb = Math.min(length, b);
    // case partielle au bord : gardée seulement si au moins la moitié est visible
    if (cb - ca < period / 2) continue;
    if (!lines.length || lines[lines.length - 1] !== ca) lines.push(ca);
    lines.push(cb);
  }
  // dédoublonne : des cases contiguës partagent leur bord
  return lines.filter((v, i) => i === 0 || v !== lines[i - 1]);
}

/**
 * Grille → bords de cases. xs[i]..xs[i+1] est la colonne i (en pixels source).
 * @returns {{ xs: number[], ys: number[] }}
 */
export function gridLines(grid, width, height) {
  return {
    xs: axisLines(width, grid.period, grid.offsetX),
    ys: axisLines(height, grid.period, grid.offsetY),
  };
}

/**
 * Grille pour une taille de sortie choisie, au lieu d'une grille détectée :
 * pour une photo ou une image normale, qui n'a pas de gros pixels à retrouver.
 * Le côté le plus long de l'image fait `size` cases (64 → 64 × 48 pour du 4:3),
 * chaque case étant un bloc de période source/size, fractionnaire si besoin.
 */
export function targetGrid(width, height, size) {
  const n = Math.max(1, Math.round(size));
  return { period: Math.max(width, height) / n, offsetX: 0, offsetY: 0 };
}
