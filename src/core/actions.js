// Animations prêtes à l'emploi, en plus de la marche (voir walk.js), à partir des membres
// reconnus par detectLimbs : le repos (il respire), l'attaque (il arme puis frappe vers
// l'avant) et le touché (il recule sous le coup). Chacune est une liste de poses, à
// retoucher ensuite comme n'importe quelle pose.
//
// Sens des angles (comme walk.js) : un angle positif fait tourner à l'écran dans le sens
// horaire ; pour un membre pendant, le bout part alors vers la gauche. Regarder vers la
// droite (facing = 1) : l'avant d'un membre pendant est un angle négatif.

import { BODY } from './rig.js';
import { walkPoses } from './walk.js';
import { lerpPose } from './poses.js';

export const ACTIONS = ['repos', 'marche', 'attaque', 'touche'];

/**
 * Les variantes de chaque animation (la première est celle par défaut) : la marche peut être une
 * course, une glisse de patineur ou un dandinement ; l'attaque une frappe, une charge ou un lancer…
 * Depix les montre toutes en aperçu animé, sur le personnage découpé, avant d'en choisir une.
 */
export const VARIANTES = {
  repos: [{ key: 'respire', label: 'Respire' }, { key: 'balance', label: 'Se balance' }],
  marche: [{ key: 'marche', label: 'Marche' }, { key: 'course', label: 'Course' }, { key: 'glisse', label: 'Glisse' }, { key: 'dandine', label: 'Dandine' }],
  attaque: [{ key: 'frappe', label: 'Frappe' }, { key: 'charge', label: 'Charge' }, { key: 'lancer', label: 'Lancer' }],
  touche: [{ key: 'recul', label: 'Recul' }, { key: 'secousse', label: 'Secousse' }],
};

/** Nombre d'images par défaut et cadence conseillée (images par seconde) de chaque animation. */
export const ACTION_INFO = {
  repos: { label: 'Repos', fps: 4 },
  marche: { label: 'Marche', fps: 10 },
  attaque: { label: 'Attaque', fps: 10 },
  touche: { label: 'Touché', fps: 8 },
};

const p = (angle = 0, dx = 0, dy = 0) => ({ angle: Math.round(angle), dx: Math.round(dx), dy: Math.round(dy) });

/**
 * Une pose à partir de réglages simples, appliqués à tous les membres :
 *   arm / fore : angle du bras et de l'avant-bras vers l'avant (en degrés, signe selon le regard) ;
 *   thigh / shin : idem pour les jambes ; body : décalage du corps { dx (vers l'avant), dy } ;
 *   lead : le bras / la jambe du côté du regard reçoit `lead` fois l'angle (1 : les deux pareil).
 */
function posed(limbs, facing, { arm = 0, fore = 0, thigh = 0, shin = 0, body = {}, lead = 1, armLift = 0 }) {
  const pose = {};
  const fwd = -facing; // l'avant, en signe d'angle
  for (const a of limbs.arms) {
    const k = a.side === facing ? lead : 1;
    const [upper, foreArm, hand] = a.parts;
    pose[upper] = p(a.base + fwd * arm * k + fwd * armLift);
    if (foreArm !== undefined) pose[foreArm] = p(fwd * fore * k);
    if (hand !== undefined) pose[hand] = p(-0.3 * fwd * fore * k);
  }
  for (const l of limbs.legs) {
    const k = l.side === facing ? 1 : -1;
    const [th, sh, foot] = l.parts;
    // la jambe du côté du regard part en avant, l'autre en arrière ; le genou plie vers l'arrière
    const thighA = fwd * thigh * k;
    const shinA = sh !== undefined ? -fwd * shin * Math.max(0, k) : 0;
    pose[th] = p(thighA);
    if (sh !== undefined) pose[sh] = p(shinA);
    // le pied reste à peu près à plat
    if (foot !== undefined) pose[foot] = p(-0.7 * (thighA + shinA));
  }
  pose[BODY] = p(0, facing * (body.dx || 0), body.dy || 0);
  return pose;
}

/**
 * @param limbs résultat de detectLimbs (avec .height)
 * @param action 'repos' | 'marche' | 'attaque' | 'touche'
 * @param style 'face' | 'droite' | 'gauche' (direction du regard)
 * @returns {Array<object>} les poses
 */
function basePoses(limbs, action, { style = 'droite', keepPose = true, variante, frames } = {}) {
  // keepPose : la pose dessinée est la pose de repos (un bras replié sur un ballon le reste) ;
  // sinon les bras sont d'abord ramenés le long du corps, comme la marche de walk.js
  if (keepPose) limbs = { ...limbs, arms: limbs.arms.map((a) => ({ ...a, base: 0 })) };
  const v = variante || VARIANTES[action]?.[0].key;
  if (action === 'marche' && (v === 'marche' || v === 'course')) {
    const poses = walkPoses(limbs, { style, amp: v === 'course' ? 1.6 : 1, frames: frames || 8 });
    if (!keepPose) return poses;
    // un bras dessiné replié (sur un ballon, une arme) balance deux fois moins qu'un bras pendant
    const armParts = new Set(limbs.arms.flatMap((a) => a.parts));
    return poses.map((pose) => Object.fromEntries(Object.entries(pose).map(([id, q]) => [id, armParts.has(Number(id)) ? { ...q, angle: Math.round(q.angle / 2) } : q])));
  }
  const facing = style === 'gauche' ? -1 : 1;
  const H = limbs.height || 40;
  const u = Math.max(1, Math.round(H * 0.015)); // un « pas » de décalage, à l'échelle du sprite
  const special = variantPoses(limbs, v, { facing, profile: style !== 'face', u, frames: frames || 8 });
  if (special) return special;
  if (style === 'face') return facePoses(limbs, action, u);
  if (action === 'repos') {
    // il respire : le corps descend d'un cran, les bras suivent à peine
    return [
      posed(limbs, facing, {}),
      posed(limbs, facing, { arm: 2, body: { dy: 0 } }),
      posed(limbs, facing, { arm: 3, fore: 2, body: { dy: u } }),
      posed(limbs, facing, { arm: 2, fore: 1, body: { dy: u } }),
    ];
  }
  if (action === 'attaque') {
    // il arme (bras en arrière, corps en retrait), frappe (bras projetés, corps en avant), tient, revient
    return [
      posed(limbs, facing, { arm: -25, fore: 20, thigh: -4, body: { dx: -u, dy: u } }),
      posed(limbs, facing, { arm: -35, fore: 30, thigh: -6, shin: 6, body: { dx: -2 * u, dy: u } }),
      posed(limbs, facing, { arm: 35, fore: -10, thigh: 12, shin: 4, lead: 1.3, body: { dx: 4 * u } }),
      posed(limbs, facing, { arm: 40, fore: -15, thigh: 14, shin: 4, lead: 1.3, body: { dx: 4 * u } }),
      posed(limbs, facing, { arm: 20, fore: 0, thigh: 4, body: { dx: u } }),
    ];
  }
  if (action === 'touche') {
    // il encaisse : recule, bras projetés en arrière, puis se reprend
    return [
      posed(limbs, facing, { arm: -30, fore: -15, thigh: -10, shin: 10, body: { dx: -3 * u, dy: -u } }),
      posed(limbs, facing, { arm: -20, fore: -10, thigh: -6, shin: 6, body: { dx: -2 * u } }),
      posed(limbs, facing, { arm: -5, thigh: -2, body: { dx: -u } }),
    ];
  }
  return [posed(limbs, facing, {})];
}

/** De face : pas d'avant ni d'arrière, les bras s'écartent ou montent symétriquement. */
function facePoses(limbs, action, u) {
  const sym = (armOut, bodyDy = 0, legOut = 0) => {
    const pose = {};
    for (const a of limbs.arms) {
      const [upper, fore] = a.parts;
      // vers l'extérieur : le bras gauche (side -1) tourne dans le sens horaire, comme la jambe de walk.js
      pose[upper] = p(a.base - a.side * armOut);
      if (fore !== undefined) pose[fore] = p(-a.side * armOut * 0.3);
    }
    for (const l of limbs.legs) pose[l.parts[0]] = p(-l.side * legOut);
    pose[BODY] = p(0, 0, bodyDy);
    return pose;
  };
  if (action === 'repos') return [sym(0), sym(2), sym(3, u), sym(2, u)];
  if (action === 'attaque') return [sym(-10, u), sym(-15, u, 3), sym(60, 0, 6), sym(65, 0, 6), sym(20)];
  if (action === 'touche') return [sym(35, -u, 6), sym(20, 0, 3), sym(5)];
  return [sym(0)];
}

/** La jambe ou le bras du côté du regard (le premier sinon). */
const lead = (list, facing) => list.find((l) => l.side === facing) || list[0];

/**
 * Les variantes autres que celles par défaut ; null pour une variante par défaut (traitée plus haut).
 * profile : de profil (sinon de face) ; u : un pas de décalage, à l'échelle du sprite.
 */
function variantPoses(limbs, v, { facing, profile, u, frames }) {
  const fwd = -facing;
  const set = (pose, id, angle = 0, dx = 0, dy = 0) => { if (id !== undefined) pose[id] = p(angle, dx, dy); };
  if (v === 'glisse') {
    // patin : une jambe pousse (en arrière de profil, vers l'extérieur de face), l'autre porte, genou plié ;
    // le corps reste bas et glisse vers la jambe qui porte ; les bras balancent large
    return Array.from({ length: frames }, (_, i) => {
      const phi = (2 * Math.PI * i) / frames;
      const pose = {};
      let dx = 0;
      for (const l of limbs.legs) {
        const push = Math.max(0, Math.sin(phi + l.phase));
        const [th, sh, foot] = l.parts;
        let thA, shA;
        if (profile) {
          thA = facing * 30 * push + fwd * 10 * (1 - push);
          shA = facing * 6 * push + facing * 16 * (1 - push);
        } else {
          thA = -l.side * 22 * push;
          shA = l.side * 8 * push;
          dx += -l.side * 1.5 * u * push;
        }
        set(pose, th, thA); set(pose, sh, shA); set(pose, foot, -0.7 * (thA + shA));
      }
      for (const a of limbs.arms) {
        const swing = Math.sin(phi + a.phase);
        const [upper, fore] = a.parts;
        set(pose, upper, a.base + (profile ? fwd * 34 * swing : -a.side * 16 * Math.max(0, swing)));
        set(pose, fore, profile ? facing * 10 * Math.max(0, swing) : 0);
      }
      pose[BODY] = p(0, dx, 2 * u);
      return pose;
    });
  }
  if (v === 'dandine') {
    // petits pas, le corps se balance d'un côté à l'autre, les bras écartés
    return walkPoses(limbs, { style: profile ? (facing < 0 ? 'gauche' : 'droite') : 'face', amp: 0.6, frames }).map((pose, i) => {
      const sway = Math.round(Math.sin((2 * Math.PI * i) / frames) * 2 * u);
      for (const a of limbs.arms) set(pose, a.parts[0], a.base - a.side * 12);
      return { ...pose, [BODY]: p(0, sway, pose[BODY]?.dy ?? 0) };
    });
  }
  if (v === 'balance') {
    // au repos, il se balance d'un pied sur l'autre
    return [0, 1, 0, -1].map((k) => {
      const pose = {};
      for (const a of limbs.arms) set(pose, a.parts[0], a.base + k * 3);
      pose[BODY] = p(0, k * u, Math.abs(k) * u);
      return pose;
    });
  }
  if (v === 'charge') {
    // tête baissée : il se ramasse, puis fonce corps en avant, jambe d'appel tendue derrière
    const steps = [[-1, 1, -10, 0], [-2, 2, -15, 0], [5, 0, 25, 1], [6, 0, 30, 1], [2, 0, 10, 0]];
    return steps.map(([bx, by, legA, armBack]) => {
      const pose = {};
      for (const l of limbs.legs) {
        const k = l.side === facing || !profile ? 1 : -1;
        const thA = profile ? fwd * legA * k : -l.side * Math.abs(legA) * 0.3;
        set(pose, l.parts[0], thA); set(pose, l.parts[2], -0.7 * thA);
      }
      for (const a of limbs.arms) set(pose, a.parts[0], a.base + (profile ? facing * 30 * armBack : -a.side * 20 * armBack));
      pose[BODY] = p(0, facing * bx * u, by * u);
      return pose;
    });
  }
  if (v === 'lancer') {
    // le bras du côté du regard s'arme au-dessus de l'épaule, puis lance vers l'avant
    const arm = lead(limbs.arms, facing);
    if (!arm) return null;
    const angles = profile ? [-40, -150, 70, 50, 10] : [-60, -160, 30, 20, 0];
    return angles.map((a, i) => {
      const pose = {};
      const [upper, fore] = arm.parts;
      set(pose, upper, arm.base + (profile ? fwd * a : arm.side * a));
      set(pose, fore, profile ? fwd * (i === 1 ? -40 : 0) : 0);
      pose[BODY] = p(0, (i >= 2 ? 2 : i === 1 ? -1 : 0) * facing * u, 0);
      return pose;
    });
  }
  if (v === 'secousse') {
    // le coup le secoue sur place, bras levés
    return [1, -1, 1, 0].map((k, i) => {
      const pose = {};
      for (const a of limbs.arms) set(pose, a.parts[0], a.base + (profile ? facing * 15 : -a.side * 15) * (i < 3 ? 1 : 0.3));
      pose[BODY] = p(0, k * u, i < 3 ? -u : 0);
      return pose;
    });
  }
  return null;
}

/** Les animations qui bouclent : leur dernière image enchaîne sur la première. */
const BOUCLES = new Set(['repos', 'marche']);

/**
 * `n` poses réparties régulièrement le long d'une liste d'images clés (l'animation garde son rythme, avec moins ou
 * plus d'images). En boucle, la dernière image clé rejoint la première.
 */
export function resample(poses, n, loop) {
  const L = poses.length;
  if (!n || n === L || L < 2) return poses;
  return Array.from({ length: n }, (_, i) => {
    const t = loop ? (i * L) / n : n === 1 ? 0 : (i * (L - 1)) / (n - 1);
    const k = Math.min(L - 1, Math.floor(t));
    return lerpPose(poses[k], poses[(k + 1) % L === 0 && !loop ? k : (k + 1) % L], t - k);
  });
}

/**
 * Les poses d'une animation, avec `frames` images si demandé (sinon son nombre naturel : 8 pour la marche, 4 pour le
 * repos, 5 pour l'attaque, 3 pour le touché). La marche et ses variantes sont refaites pour ce nombre ; les autres
 * animations sont ré-échantillonnées le long de leurs images clés.
 */
export function actionPoses(limbs, action, opts = {}) {
  const poses = basePoses(limbs, action, opts);
  if (!opts.frames) return poses;
  const cycle = action === 'marche' && ['marche', 'course', 'glisse', 'dandine'].includes(opts.variante || 'marche');
  return cycle ? poses : resample(poses, opts.frames, BOUCLES.has(action));
}
