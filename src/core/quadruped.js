// Les animaux à quatre pattes, vus de profil ou de trois quarts : leur squelette (deux pièces par patte, la tête,
// la queue), les articulations lues sur la silhouette, et leurs animations (le pas en diagonale, le trot, le repos,
// la charge tête baissée, le recul).
//
// Les pattes « proches » sont celles du côté du spectateur, « loin » celles de l'autre côté. Sens des angles comme
// walk.js : un angle positif tourne dans le sens horaire à l'écran ; pour une patte pendante, l'avant (du côté du
// regard, facing = 1 vers la droite) est un angle négatif.

import { BODY } from './rig.js';
import { focusBounds } from './frame.js';
import { resample } from './actions.js';

/** key, name, parent (key | null = corps), joint : articulation qui sert de pivot. */
export const QUAD_PARTS = [
  { key: 'thighBN', name: 'Cuisse arrière proche', parent: null, joint: 'hipBN' },
  { key: 'shinBN', name: 'Jambe arrière proche', parent: 'thighBN', joint: 'hockBN' },
  { key: 'thighBF', name: 'Cuisse arrière loin', parent: null, joint: 'hipBF' },
  { key: 'shinBF', name: 'Jambe arrière loin', parent: 'thighBF', joint: 'hockBF' },
  { key: 'thighFN', name: 'Cuisse avant proche', parent: null, joint: 'shoulderFN' },
  { key: 'shinFN', name: 'Jambe avant proche', parent: 'thighFN', joint: 'kneeFN' },
  { key: 'thighFF', name: 'Cuisse avant loin', parent: null, joint: 'shoulderFF' },
  { key: 'shinFF', name: 'Jambe avant loin', parent: 'thighFF', joint: 'kneeFF' },
  { key: 'head', name: 'Tête', parent: null, joint: 'neck' },
  { key: 'tail', name: 'Queue', parent: null, joint: 'tail' },
];

export const QUAD_JOINT_LABELS = {
  hipBN: 'Hanche arrière proche', hockBN: 'Jarret arrière proche',
  hipBF: 'Hanche arrière loin', hockBF: 'Jarret arrière loin',
  shoulderFN: 'Épaule avant proche', kneeFN: 'Genou avant proche',
  shoulderFF: 'Épaule avant loin', kneeFF: 'Genou avant loin',
  neck: 'Cou', tail: 'Base de la queue',
};

/** Les variantes des animations d'un quadrupède (la première est celle par défaut). */
export const QUAD_VARIANTES = {
  repos: [{ key: 'respire', label: 'Respire' }],
  marche: [{ key: 'pas', label: 'Pas' }, { key: 'trot', label: 'Trot' }],
  attaque: [{ key: 'charge', label: 'Charge' }],
  touche: [{ key: 'recul', label: 'Recul' }],
};

/** Vrai si le découpage est celui d'un quadrupède (il a des cuisses avant et arrière). */
export const isQuadruped = (rig) => rig.parts.some((p) => /^cuisse (avant|arrière)/i.test(p.name));

const snap = (v) => Math.floor(v) + 0.5;
const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 0;

/** Segments d'opaque d'une ligne. */
function runs(img, y) {
  const out = [];
  let start = -1;
  for (let x = 0; x <= img.width; x++) {
    const o = x < img.width && opaque(img, x, y);
    if (o && start < 0) start = x;
    if (!o && start >= 0) { out.push([start, x - 1]); start = -1; }
  }
  return out;
}

/** Le milieu du segment le plus proche de `x` sur la ligne `y`. */
function centerNear(img, y, x) {
  let best = null, bd = Infinity;
  for (const [a, b] of runs(img, Math.round(y))) {
    const d = x < a ? a - x : x > b ? x - b : 0;
    if (d < bd) { bd = d; best = (a + b + 1) / 2; }
  }
  return best ?? x;
}

/**
 * Les articulations d'un quadrupède d'après sa silhouette : le regard (la tête est du côté le plus chargé en haut),
 * la ligne du ventre (la plus basse ligne large), les quatre pattes (les segments sous le ventre), le dos, le cou et
 * la base de la queue. @returns {{ joints: Record<string, {x, y}>, facing: 1 | -1 }}
 */
export function estimateQuadJoints(base) {
  const b = focusBounds(base);
  const W = Math.max(1, b.x1 - b.x0), H = Math.max(1, b.y1 - b.y0);
  const midX = (b.x0 + b.x1) / 2;
  // le regard : la tête (et ses bois) chargent le haut de l'image d'un côté
  let left = 0, right = 0;
  for (let y = b.y0; y < b.y0 + H * 0.45; y++) for (let x = b.x0; x < b.x1; x++) if (opaque(base, x, y)) (x < midX ? left++ : right++);
  const facing = right >= left ? 1 : -1;
  // le ventre : en remontant depuis les sabots, la première ligne dont un segment couvre près de la moitié de la largeur
  let belly = Math.round(b.y0 + H * 0.65);
  for (let y = b.y1 - 1; y > b.y0 + H * 0.3; y--) {
    if (runs(base, y).some(([a, c]) => c - a + 1 >= W * 0.42)) { belly = y; break; }
  }
  const torso = runs(base, belly).reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m), [midX, midX]);
  const bodyX = (torso[0] + torso[1] + 1) / 2;
  // les pattes : les segments à mi-hauteur entre le ventre et les sabots
  const legY = Math.round((belly + b.y1) / 2);
  let legs = runs(base, legY).filter(([a, c]) => c - a >= 1).map(([a, c]) => (a + c + 1) / 2);
  while (legs.length < 4) {
    // pattes qui se touchent : on coupe le segment le plus large en deux
    const all = runs(base, legY).filter(([a, c]) => c - a >= 1);
    if (!all.length) { legs = [torso[0] + W * 0.1, torso[0] + W * 0.25, torso[1] - W * 0.25, torso[1] - W * 0.1]; break; }
    const w = all.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m));
    legs = [...legs.filter((x) => x < w[0] || x > w[1]), w[0] + (w[1] - w[0]) / 3, w[0] + (2 * (w[1] - w[0])) / 3];
  }
  legs.sort((p, q) => p - q);
  if (legs.length > 4) legs = [legs[0], legs[1], legs[legs.length - 2], legs[legs.length - 1]];
  // de l'arrière vers l'avant ; dans chaque paire, la patte proche est la plus en arrière (trois quarts)
  const ordered = facing > 0 ? legs : [...legs].reverse();
  const [bn, bf, fn, ff] = ordered;
  const hipY = belly - H * 0.03, kneeY = belly + (b.y1 - belly) * 0.45;
  const J = {};
  for (const [key, x, top, low] of [['BN', bn, 'hip', 'hock'], ['BF', bf, 'hip', 'hock'], ['FN', fn, 'shoulder', 'knee'], ['FF', ff, 'shoulder', 'knee']]) {
    J[top + key] = { x: centerNear(base, belly + 2, x), y: hipY };
    J[low + key] = { x: centerNear(base, kneeY, x), y: kneeY };
  }
  // le dos : le haut du torse au milieu du corps ; le cou devant les épaules ; la queue au bout de la croupe
  let back = belly;
  for (let y = belly; y > b.y0 && opaque(base, Math.round(bodyX), y); y--) back = y;   // jusqu'au premier vide : pas les bois
  const neckY = back + (belly - back) * 0.15;
  const frontLeg = facing > 0 ? Math.max(fn, ff) : Math.min(fn, ff);   // la patte avant la plus en avant
  J.neck = { x: frontLeg + facing * W * 0.08, y: neckY };
  const tailY = Math.round(back + (belly - back) * 0.15);
  const row = runs(base, tailY);
  const rear = row.length ? (facing > 0 ? row[0][0] : row[row.length - 1][1]) : torso[facing > 0 ? 0 : 1];
  J.tail = { x: rear + facing * 3, y: tailY };
  for (const k of Object.keys(J)) J[k] = { x: snap(J[k].x), y: snap(J[k].y) };
  return { joints: J, facing };
}

/** Les pièces d'un quadrupède par nom (celles qui existent). */
function partsByRole(rig) {
  const find = (name) => rig.parts.find((p) => p.name === name)?.id;
  const leg = (where, side) => ({ thigh: find(`Cuisse ${where} ${side}`), shin: find(`Jambe ${where} ${side}`) });
  return {
    // les paires diagonales avancent ensemble : avant proche avec arrière loin, avant loin avec arrière proche
    legs: [
      { ...leg('avant', 'proche'), phase: 0, front: true },
      { ...leg('arrière', 'loin'), phase: 0, front: false },
      { ...leg('avant', 'loin'), phase: Math.PI, front: true },
      { ...leg('arrière', 'proche'), phase: Math.PI, front: false },
    ].filter((l) => l.thigh !== undefined),
    head: find('Tête'),
    tail: find('Queue'),
  };
}

/** Le regard d'un quadrupède découpé : la tête du côté où est le cou par rapport à la queue. */
export function quadFacing(rig) {
  const neck = rig.parts.find((p) => p.name === 'Tête')?.pivot, tail = rig.parts.find((p) => p.name === 'Queue')?.pivot;
  return neck && tail && neck.x < tail.x ? -1 : 1;
}

const P = (angle = 0, dx = 0, dy = 0) => ({ angle: Math.round(angle), dx: Math.round(dx), dy: Math.round(dy) });

/**
 * Les poses d'une animation de quadrupède.
 * @param {number} height hauteur du sprite (pour l'échelle des rebonds)
 * @param {{ facing?: 1 | -1, variante?: string, frames?: number }} opts
 */
export function quadPoses(rig, action, height, { facing = 1, variante, frames } = {}) {
  const { legs, head, tail } = partsByRole(rig);
  const fwd = -facing;
  const u = Math.max(1, Math.round(height * 0.012));
  const set = (pose, id, angle = 0, dx = 0, dy = 0) => { if (id !== undefined) pose[id] = P(angle, dx, dy); };
  const v = variante || QUAD_VARIANTES[action]?.[0].key;
  if (action === 'marche') {
    // le pas : les paires diagonales avancent à tour de rôle ; la jambe qui avance plie (le sabot décolle)
    const trot = v === 'trot';
    const n = frames || 8;
    const swing = trot ? 26 : 18, bend = trot ? 38 : 26;
    return Array.from({ length: n }, (_, i) => {
      const phi = (2 * Math.PI * i) / n;
      const pose = {};
      for (const l of legs) {
        const s = Math.sin(phi + l.phase), up = Math.max(0, Math.cos(phi + l.phase));
        const thighA = fwd * swing * s;
        // la patte qui se lève replie son bas vers l'arrière (le sabot remonte derrière)
        set(pose, l.thigh, thighA);
        set(pose, l.shin, facing * bend * up);
      }
      set(pose, head, facing * (trot ? 4 : 3) * Math.sin(2 * phi));
      set(pose, tail, facing * 8 * Math.sin(phi));
      pose[BODY] = P(0, 0, Math.round(u * (trot ? 2 : 1) * (0.5 - 0.5 * Math.cos(2 * phi))));
      return pose;
    });
  }
  let poses;
  if (action === 'repos') {
    // il respire, la tête bouge à peine, la queue frémit
    poses = [0, 1, 2, 1].map((k) => {
      const pose = {};
      set(pose, head, facing * k);
      set(pose, tail, facing * (k === 2 ? 10 : 0));
      pose[BODY] = P(0, 0, k === 2 ? u : 0);
      return pose;
    });
  } else if (action === 'attaque') {
    // la charge : il baisse la tête (les bois en avant), pousse des pattes arrière et se jette en avant
    poses = [[0, -1, 10], [25, -2, 18], [35, 4, 28], [35, 5, 30], [10, 1, 8]].map(([headA, bx, push]) => {
      const pose = {};
      for (const l of legs) set(pose, l.thigh, l.front ? fwd * push * 0.6 : -fwd * push);
      set(pose, head, facing * headA);
      set(pose, tail, -facing * 10);
      pose[BODY] = P(0, facing * bx * u, headA > 20 ? u : 0);
      return pose;
    });
  } else if (action === 'touche') {
    // le recul : tête relevée, il se cabre un peu en arrière, puis se reprend
    poses = [[-20, -3], [-12, -2], [-4, -1]].map(([headA, bx]) => {
      const pose = {};
      for (const l of legs) set(pose, l.thigh, l.front ? -fwd * 12 : fwd * 6);
      set(pose, head, facing * headA);
      set(pose, tail, facing * 15);
      pose[BODY] = P(0, facing * bx * u, -u);
      return pose;
    });
  } else poses = [{}];
  return frames ? resample(poses, frames, action === 'repos') : poses;
}
