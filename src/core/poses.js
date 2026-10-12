// Poses : interpolation entre deux images clés.
// Une pose = { [idPièce]: { angle, dx, dy } } (angle en degrés relatif au parent).

const round = Math.round;

/** Mélange linéaire de deux poses. t = 0 → a, t = 1 → b. Les décalages restent entiers (pixels nets). */
export function lerpPose(a, b, t) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[id] || { angle: 0, dx: 0, dy: 0 };
    const q = b[id] || { angle: 0, dx: 0, dy: 0 };
    out[id] = {
      angle: round(((p.angle || 0) + ((q.angle || 0) - (p.angle || 0)) * t) * 10) / 10,
      dx: round((p.dx || 0) + ((q.dx || 0) - (p.dx || 0)) * t),
      dy: round((p.dy || 0) + ((q.dy || 0) - (p.dy || 0)) * t),
    };
  }
  return out;
}

/** `count` poses intermédiaires, réparties régulièrement entre a et b (bornes exclues). */
export function inBetween(a, b, count) {
  return Array.from({ length: count }, (_, k) => lerpPose(a, b, (k + 1) / (count + 1)));
}
