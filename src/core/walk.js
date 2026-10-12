// Cycle de marche prêt à l'emploi à partir d'un sprite découpé.
//
// Les membres sont reconnus par leur nom quand il est parlant (bras, jambe, cuisse…),
// sinon par leur géométrie et la hiérarchie :
//   - une pièce rattachée au corps, avec son pivot dans la moitié basse du sprite, est
//     une jambe (cuisse) ; sa pièce enfant est le bas de jambe ;
//   - dans la moitié haute, une pièce allongée est un bras (haut du bras), son enfant
//     est l'avant-bras ; une pièce ronde seule (la tête) est ignorée ;
//   - le côté (gauche / droite à l'écran) vient de la position du pivot par rapport au
//     corps : chaque bras balance à l'opposé de la jambe du même côté.
// La pose de repos du bras est « pendu le long du corps » : l'angle est calculé à
// partir de la direction réelle du bras (bras écarté en T ou déjà baissé).

import { BODY } from './rig.js';
import { opaqueBounds } from './rotsprite.js';

const LEG_WORDS = /jambe|cuisse|mollet|tibia|genou|pied|leg|thigh|shin|calf|foot|knee/i;
const ARM_WORDS = /bras|[ée]paule|coude|main|arm|hand|shoulder|elbow/i;
const HEAD_WORDS = /t[eê]te|head|visage|cheveux|objet|raquette|balle|ball|racket/i;

/** Pixels, centre et boîte de chaque pièce. */
function partStats(rig) {
  const { width: w } = rig;
  const stats = new Map();
  for (let i = 0; i < rig.labels.length; i++) {
    const l = rig.labels[i];
    const x = i % w, y = (i - x) / w;
    const s = stats.get(l) || { n: 0, sx: 0, sy: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    s.n++; s.sx += x + 0.5; s.sy += y + 0.5;
    s.x0 = Math.min(s.x0, x); s.x1 = Math.max(s.x1, x); s.y0 = Math.min(s.y0, y); s.y1 = Math.max(s.y1, y);
    stats.set(l, s);
  }
  return stats;
}

/**
 * @returns {{ arms: Array, legs: Array } | null} chaque membre : { side: -1|1, parts: [id…], base: angle de repos (°), phase }
 */
export function detectLimbs(base, rig) {
  // on ne compte que les pixels opaques
  const labels = new Uint8Array(rig.labels);
  for (let i = 0; i < labels.length; i++) if (!base.data[i * 4 + 3]) labels[i] = 255;
  const stats = partStats({ ...rig, labels });
  stats.delete(255);

  const bounds = opaqueBounds(base);
  if (!bounds) return null;
  const midY = bounds.y0 + 0.5 * (bounds.y1 - bounds.y0);
  const body = stats.get(BODY);
  const centerX = body ? (body.x0 + body.x1 + 1) / 2 : (bounds.x0 + bounds.x1) / 2;

  const kids = new Map();
  for (const p of rig.parts) {
    if (p.id === BODY || p.parent === null || p.parent === undefined) continue;
    kids.set(p.parent, [...(kids.get(p.parent) || []), p.id]);
  }
  const chainFrom = (id) => {
    const chain = [id];
    for (let guard = 0; guard < 4; guard++) {
      const next = (kids.get(chain[chain.length - 1]) || [])
        .filter((k) => stats.has(k))
        .sort((a, b) => stats.get(b).n - stats.get(a).n)[0];
      if (next === undefined) break;
      chain.push(next);
    }
    return chain;
  };

  const arms = [], legs = [];
  for (const part of rig.parts) {
    if (part.id === BODY || !stats.has(part.id)) continue;
    if (part.parent !== BODY && part.parent !== null && part.parent !== undefined) continue;   // racine seulement
    if (HEAD_WORDS.test(part.name)) continue;
    const st = stats.get(part.id);
    const named = LEG_WORDS.test(part.name) ? 'leg' : ARM_WORDS.test(part.name) ? 'arm' : null;
    const chain = chainFrom(part.id).filter((id) => !HEAD_WORDS.test(rig.parts.find((p) => p.id === id).name));
    const cx = st.sx / st.n, cy = st.sy / st.n;
    const dx = cx - part.pivot.x, dy = cy - part.pivot.y;
    const len = Math.hypot(dx, dy);
    const w = st.x1 - st.x0 + 1, h = st.y1 - st.y0 + 1;
    const side = part.pivot.x < centerX ? -1 : 1;
    const down = named ? named === 'leg' : part.pivot.y > midY;
    // tête : pièce courte, au centre du corps, en haut
    const bodyW = body ? body.x1 - body.x0 + 1 : bounds.x1 - bounds.x0 + 1;
    if (!named && !down && chain.length === 1 && Math.max(w, h) / Math.min(w, h) < 1.6 && Math.abs(cx - centerX) < 0.25 * bodyW) continue;
    // pivot confondu avec le centre de la pièce : on suppose le membre pendant vers le bas
    const theta = len < 1 ? Math.PI / 2 : Math.atan2(dy, dx);
    const baseAngle = ((Math.PI / 2 - theta) * 180) / Math.PI;     // pour pendre vers le bas
    const limb = { side, parts: chain, base: Math.round(((baseAngle + 540) % 360) - 180) };
    (down ? legs : arms).push(limb);
  }
  if (!arms.length && !legs.length) return null;
  // phase : jambe de gauche à l'écran = 0, de droite = π ; bras = opposé de la jambe du même côté
  for (const l of legs) l.phase = l.side < 0 ? 0 : Math.PI;
  for (const a of arms) a.phase = a.side < 0 ? Math.PI : 0;
  return { arms, legs, height: bounds.y1 - bounds.y0 };
}

/**
 * Les 8 poses d'un cycle de marche.
 * @param style 'face' (pas de balancement de côté : le pied se lève) | 'droite' | 'gauche' (profil, direction du regard)
 */
export function walkPoses(limbs, { style = 'face', frames = 8 } = {}) {
  const facing = style === 'gauche' ? -1 : 1;
  const profile = style !== 'face';
  const poses = [];
  const bodyDown = Math.max(1, Math.round(limbs.height * 0.012));
  for (let i = 0; i < frames; i++) {
    const phi = (2 * Math.PI * i) / frames;
    const pose = {};
    const sin = (phase) => Math.sin(phi + phase);
    const cos = (phase) => Math.cos(phi + phase);

    for (const leg of limbs.legs) {
      const [thigh, shin] = leg.parts;
      if (profile) {
        // avant = -facing (angle positif = sens horaire à l'écran)
        pose[thigh] = { angle: Math.round(-facing * 26 * sin(leg.phase)), dx: 0, dy: 0 };
        if (shin !== undefined) pose[shin] = { angle: Math.round(facing * 42 * Math.max(0, cos(leg.phase))), dx: 0, dy: 0 };
      } else {
        const lift = Math.round(limbs.height * 0.035 * Math.max(0, sin(leg.phase)));
        if (shin !== undefined) pose[shin] = { angle: 0, dx: 0, dy: -lift };
        else pose[thigh] = { angle: 0, dx: 0, dy: -lift };
      }
    }
    for (const arm of limbs.arms) {
      const [upper, fore] = arm.parts;
      const swing = (profile ? 28 : 6) * sin(arm.phase);
      pose[upper] = { angle: Math.round(arm.base + (profile ? -facing : arm.side) * swing), dx: 0, dy: 0 };
      if (fore !== undefined) {
        const flex = profile ? Math.round(facing * 24 * Math.max(0, sin(arm.phase))) : 0;
        pose[fore] = { angle: flex, dx: 0, dy: 0 };
      }
    }
    // le corps descend d'un cran quand les jambes sont écartées (appui)
    const contact = Math.abs(Math.sin(phi)) > 0.99;
    pose[BODY] = { angle: 0, dx: 0, dy: contact ? bodyDown : 0 };
    poses.push(pose);
  }
  return poses;
}
