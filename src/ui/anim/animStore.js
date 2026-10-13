// État du mode Animation, séparé de l'état de conversion : le sprite de départ,
// son découpage en pièces (rig), les images (une pose + des retouches chacune),
// l'étape et l'outil en cours, l'historique annuler / rétablir.

import { createStore } from '../state.js';
import { createRig, composeFrame, applyEdits, completeParts, fillPoseGaps, inferJoints, BODY } from '../../core/rig.js';
import { inBetween } from '../../core/poses.js';
import { detectLimbs, walkPoses } from '../../core/walk.js';
import { cloneImage } from '../../core/image.js';
import { HUMAN_PARTS, estimateJoints, skinFromSkeleton } from '../../core/skeleton.js';
import { removeSmallIslands } from '../../core/cleanup.js';

const NAMES = ['Bras gauche', 'Avant-bras gauche', 'Bras droit', 'Avant-bras droit', 'Cuisse gauche',
  'Jambe gauche', 'Cuisse droite', 'Jambe droite', 'Tête', 'Objet'];
const COLORS = ['#ff4fa3', '#33d1ff', '#ffd400', '#7cff6b', '#ff8a3d', '#b48cff', '#00e0b0', '#ff5f5f',
  '#5f8bff', '#f0f0f0', '#ffa8d8', '#9effff'];
const MAX_HISTORY = 80;

export const anim = createStore({
  active: false,
  base: null,        // sprite de départ { width, height, data }
  rig: null,         // découpage (voir core/rig.js) ; parts[i].pivotSet : pivot placé à la main
  frames: [],        // [{ pose, edits: Map }]
  current: 0,
  selected: BODY,    // pièce sélectionnée
  step: 'cut',       // cut (découper) | pose (poser) | touch (retoucher)
  tool: 'paint',     // cut : paint | unpaint | pivot ; touch : pencil | eraser | picker
  brush: 1,
  color: null,       // couleur du crayon de retouche
  playing: false,
  fps: 8,
  pan: false,        // outil main : glisser déplace la vue, jamais le personnage
  onion: false,      // pelure d'oignon : image précédente et suivante en transparence
  walkStyle: 'face', // face | droite | gauche
  between: 3,        // nombre d'images à intercaler
  version: 0,        // incrémenté à chaque changement du découpage
  history: { undo: 0, redo: 0 },
});

let undo = [];
let redo = [];

const bump = () => anim.set((s) => ({ version: s.version + 1 }));
const publish = () => anim.set({ history: { undo: undo.length, redo: redo.length } });

function snapshot() {
  const s = anim.get();
  return {
    labels: new Uint8Array(s.rig.labels),
    auto: s.rig.auto ? new Uint8Array(s.rig.auto) : null,
    parts: s.rig.parts.map((p) => ({ ...p, pivot: { ...p.pivot } })),
    order: [...s.rig.order],
    frames: s.frames.map((f) => ({ pose: structuredClone(f.pose), edits: new Map(f.edits) })),
    current: s.current,
    selected: s.selected,
  };
}
function restore(snap) {
  const { rig } = anim.get();
  rig.labels.set(snap.labels);
  rig.auto = snap.auto ? new Uint8Array(snap.auto) : null;
  rig.parts = snap.parts;
  rig.order = snap.order;
  anim.set({ frames: snap.frames, current: Math.min(snap.current, snap.frames.length - 1), selected: snap.selected });
  bump();
}

/** À appeler avant chaque modification annulable. */
export function commit() {
  undo.push(snapshot());
  if (undo.length > MAX_HISTORY) undo.shift();
  redo = [];
  publish();
}
export function undoLast() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); publish(); }
export function redoLast() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); publish(); }

/** Entre dans le mode : garde le découpage existant si le sprite a la même taille. */
export function start(image) {
  const s = anim.get();
  const base = cloneImage(image);
  if (s.rig && s.rig.width === base.width && s.rig.height === base.height) {
    anim.set({ base, active: true });
  } else {
    undo = []; redo = [];
    anim.set({
      base, active: true, rig: createRig(base.width, base.height),
      frames: [{ pose: {}, edits: new Map() }], current: 0, selected: BODY, step: 'cut', tool: 'paint',
    });
    anim.get().rig.parts[0].pivotSet = true;
    publish();
  }
  bump();
}
export const stop = () => anim.set({ active: false, playing: false });

/* ------------------------------------------------------------------ pièces */

export const partColor = (id) => (id === BODY ? '#9a93b5' : COLORS[(id - 1) % COLORS.length]);

export function addPart() {
  const { rig } = anim.get();
  if (rig.parts.length >= 250) return;
  commit();
  const id = Math.max(...rig.parts.map((p) => p.id)) + 1;
  const name = NAMES[rig.parts.length - 1] || `Pièce ${rig.parts.length}`;
  rig.parts.push({ id, name, pivot: { x: rig.width / 2, y: rig.height / 2 }, parent: BODY, pivotSet: false });
  rig.order.push(id);
  anim.set({ selected: id, step: 'cut', tool: 'paint' });
  bump();
}

export function removePart(id) {
  const { rig, frames } = anim.get();
  if (id === BODY) return;
  commit();
  const part = rig.parts.find((p) => p.id === id);
  for (let i = 0; i < rig.labels.length; i++) if (rig.labels[i] === id) rig.labels[i] = BODY;
  for (const p of rig.parts) if (p.parent === id) p.parent = part.parent ?? BODY;
  rig.parts = rig.parts.filter((p) => p.id !== id);
  rig.order = rig.order.filter((x) => x !== id);
  anim.set({
    selected: BODY,
    frames: frames.map((f) => { const pose = { ...f.pose }; delete pose[id]; return { ...f, pose }; }),
  });
  bump();
}

export function updatePart(id, patch, { undoable = true } = {}) {
  if (undoable) commit();
  const part = anim.get().rig.parts.find((p) => p.id === id);
  Object.assign(part, patch);
  bump();
}

/** Avance (+1) ou recule (-1) la pièce dans l'ordre de dessin. */
export function movePart(id, dir) {
  const { rig } = anim.get();
  const i = rig.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rig.order.length) return;
  commit();
  [rig.order[i], rig.order[j]] = [rig.order[j], rig.order[i]];
  bump();
}

/** Peint (ou rend au corps) les pixels opaques d'un carré de côté `brush` autour de (x, y). */
export function paintAt(x, y, id) {
  const { rig, base, brush } = anim.get();
  const r0 = -Math.floor((brush - 1) / 2);
  let changed = false;
  for (let dy = r0; dy < r0 + brush; dy++) {
    for (let dx = r0; dx < r0 + brush; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= rig.width || py >= rig.height) continue;
      const i = py * rig.width + px;
      if (!base.data[i * 4 + 3] || rig.labels[i] === id) continue;
      rig.labels[i] = id;
      if (rig.auto) rig.auto[i] = 0;
      changed = true;
    }
  }
  if (changed) bump();
}

/** Place le pivot ; la pièce se rattache à celle qu'elle touche à cet endroit. */
export function placePivot(id, x, y) {
  const { rig } = anim.get();
  commit();
  const part = rig.parts.find((p) => p.id === id);
  part.pivot = { x: x + 0.5, y: y + 0.5 };
  part.pivotSet = true;
  if (id !== BODY) {
    const votes = new Map();
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= rig.width || py >= rig.height) continue;
        const l = rig.labels[py * rig.width + px];
        if (l === id || !anim.get().base.data[(py * rig.width + px) * 4 + 3]) continue;
        votes.set(l, (votes.get(l) || 0) + 1);
      }
    }
    // les pixels pas encore attribués (le corps) sont toujours les plus nombreux : on ne
    // retient le corps que si aucune autre pièce ne touche le pivot
    votes.delete(BODY);
    let best = BODY, n = 0;
    for (const [l, v] of votes) if (v > n) { n = v; best = l; }
    part.parent = best;
  }
  bump();
}

/** Pivot provisoire au centre de la pièce tant qu'il n'a pas été placé. */
function ensurePivots() {
  const { rig } = anim.get();
  for (const p of rig.parts) {
    if (p.pivotSet) continue;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < rig.labels.length; i++) {
      if (rig.labels[i] !== p.id) continue;
      sx += i % rig.width; sy += Math.floor(i / rig.width); n++;
    }
    if (n) p.pivot = { x: Math.round(sx / n) + 0.5, y: Math.round(sy / n) + 0.5 };
  }
}

/* ------------------------------------------------------------------ images */

export function setPose(id, patch) {
  anim.set((s) => {
    const frames = [...s.frames];
    const f = frames[s.current];
    const prev = f.pose[id] || { angle: 0, dx: 0, dy: 0 };
    frames[s.current] = { ...f, pose: { ...f.pose, [id]: { ...prev, ...patch } } };
    return { frames };
  });
}

export function addFrame() {
  commit();
  anim.set((s) => {
    const frames = [...s.frames];
    frames.splice(s.current + 1, 0, { pose: structuredClone(s.frames[s.current].pose), edits: new Map() });
    return { frames, current: s.current + 1 };
  });
}
export function removeFrame() {
  const s = anim.get();
  if (s.frames.length <= 1) return;
  commit();
  const frames = s.frames.filter((_, i) => i !== s.current);
  anim.set({ frames, current: Math.min(s.current, frames.length - 1) });
}
export function moveFrame(dir) {
  const s = anim.get();
  const j = s.current + dir;
  if (j < 0 || j >= s.frames.length) return;
  commit();
  const frames = [...s.frames];
  [frames[s.current], frames[j]] = [frames[j], frames[s.current]];
  anim.set({ frames, current: j });
}

/** Retouche d'un pixel de l'image courante (rgba, a = 0 pour effacer). */
export function setEdit(index, rgba) {
  anim.set((s) => {
    const frames = [...s.frames];
    const f = frames[s.current];
    const edits = new Map(f.edits);
    edits.set(index, rgba);
    frames[s.current] = { ...f, edits };
    return { frames };
  });
}
export function clearEdits() {
  commit();
  anim.set((s) => {
    const frames = [...s.frames];
    frames[s.current] = { ...frames[s.current], edits: new Map() };
    return { frames };
  });
}

/* ---------------------------------------------------------- images composées */

const cache = new WeakMap();

/** Image d'une image de l'animation (pose + retouches), mise en cache. */
export function frameImage(frame) {
  const s = anim.get();
  const hit = cache.get(frame);
  if (hit && hit.version === s.version && hit.base === s.base) return hit.result;
  ensurePivots();
  const composed = composeFrame(s.base, s.rig, frame.pose);
  const result = { ...composed, image: applyEdits(composed.image, frame.edits) };
  cache.set(frame, { version: s.version, base: s.base, result });
  return result;
}

/* ------------------------------------------------- étapes 2 et 3 : automatismes */

/**
 * Insère `count` images entre l'image courante et la suivante (la dernière boucle
 * vers la première), poses réparties régulièrement. Renvoie le nombre d'images ajoutées.
 */
export function interpolateFrames(count) {
  const s = anim.get();
  const n = s.frames.length;
  if (n < 2 || count < 1) return 0;
  const i = s.current;
  const j = i < n - 1 ? i + 1 : 0;
  commit();
  const fresh = inBetween(s.frames[i].pose, s.frames[j].pose, count).map((pose) => ({ pose, edits: new Map() }));
  const frames = [...s.frames];
  frames.splice(i + 1, 0, ...fresh);
  anim.set({ frames, current: i + 1 });
  return count;
}

/** Remplace les images par un cycle de marche de 8 poses. Renvoie false s'il n'y a ni bras ni jambe à animer. */
export function generateWalk(style = anim.get().walkStyle) {
  // les pièces sont déjà découpées : on en déduit articulations et hiérarchie manquantes
  if (inferJoints(anim.get().base, anim.get().rig)) bump();
  ensurePivots();
  const { base, rig } = anim.get();
  const limbs = detectLimbs(base, rig);
  if (!limbs) return false;
  commit();
  const frames = walkPoses(limbs, { style }).map((pose) => ({ pose, edits: new Map() }));
  anim.set({ frames, current: 0, step: 'pose', playing: false });
  return true;
}

/** Étend les pièces peintes jusqu'aux pivots. Renvoie le nombre de pixels attribués (0 : rien n'a changé). */
export function completeCut() {
  const before = snapshot();
  const { base, rig } = anim.get();
  const n = completeParts(base, rig);
  if (!n) return 0;
  undo.push(before);
  if (undo.length > MAX_HISTORY) undo.shift();
  redo = [];
  publish();
  bump();
  return n;
}

/** Comble les vides de la pose courante (ajoutés aux retouches de l'image). Renvoie le nombre de pixels. */
export function completePose() {
  const { base, rig, frames, current } = anim.get();
  const frame = frames[current];
  const fill = fillPoseGaps(base, rig, frame.pose, frameImage(frame).image);
  if (!fill.size) return 0;
  commit();
  anim.set((s) => {
    const list = [...s.frames];
    const edits = new Map(list[s.current].edits);
    for (const [i, c] of fill) edits.set(i, c);
    list[s.current] = { ...list[s.current], edits };
    return { frames: list };
  });
  return fill.size;
}

/* ------------------------------------------------------------- squelette */

/**
 * Crée les pièces d'un squelette humain (bras, avant-bras, mains, cuisses, jambes, pieds, tête)
 * avec leurs articulations posées d'après la silhouette. Les pièces qui existent déjà (même nom)
 * sont gardées : seul leur pivot est replacé s'il ne l'a pas été à la main.
 * @returns {number} nombre de pièces créées
 */
export function addHumanSkeleton() {
  const { rig, base } = anim.get();
  commit();
  const J = estimateJoints(base);
  const ids = new Map();
  let created = 0;
  for (const spec of HUMAN_PARTS) {
    let part = rig.parts.find((p) => p.name === spec.name);
    if (!part) {
      const id = Math.max(...rig.parts.map((p) => p.id)) + 1;
      part = { id, name: spec.name, pivot: { ...J[spec.joint] }, parent: BODY, pivotSet: true };
      rig.parts.push(part);
      rig.order.push(id);
      created++;
    } else if (!part.pivotSet) {
      part.pivot = { ...J[spec.joint] };
      part.pivotSet = true;
    }
    ids.set(spec.key, part.id);
  }
  for (const spec of HUMAN_PARTS) {
    const part = rig.parts.find((p) => p.id === ids.get(spec.key));
    part.parent = spec.parent ? ids.get(spec.parent) : BODY;
  }
  anim.set({ selected: ids.get('armL'), step: 'cut', tool: 'pivot' });
  bump();
  return created;
}

/** Glisse l'articulation d'une pièce (coordonnées du sprite) ; un seul point d'annulation par geste (commit avant). */
export function movePivot(id, x, y) {
  const part = anim.get().rig.parts.find((p) => p.id === id);
  if (!part) return;
  part.pivot = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
  part.pivotSet = true;
  bump();
}

/** Découpage automatique d'après les articulations. Les pixels peints à la main ne bougent pas. */
export function autoSkin() {
  const { rig } = anim.get();
  if (!rig.auto) rig.auto = new Uint8Array(rig.labels.length);
  const before = snapshot();
  const n = skinFromSkeleton(anim.get().base, rig, rig.auto);
  undo.push(before);
  if (undo.length > MAX_HISTORY) undo.shift();
  redo = [];
  publish();
  bump();
  return n;
}

/** Retire les îlots de moins de `minSize` pixels de l'image courante (ou de toutes). Renvoie le nombre de pixels. */
export function cleanIslands({ all = false, minSize = 6 } = {}) {
  const s = anim.get();
  const targets = all ? s.frames.map((_, i) => i) : [s.current];
  const found = targets.map((i) => {
    const img = frameImage(s.frames[i]).image;
    const out = removeSmallIslands(img, minSize);
    const gone = [];
    for (let k = 0; k < img.data.length; k += 4) if (img.data[k + 3] && !out.data[k + 3]) gone.push(k / 4);
    return { i, gone };
  });
  const total = found.reduce((a, f) => a + f.gone.length, 0);
  if (!total) return 0;
  commit();
  anim.set((st) => {
    const frames = [...st.frames];
    for (const { i, gone } of found) {
      if (!gone.length) continue;
      const edits = new Map(frames[i].edits);
      for (const k of gone) edits.set(k, [0, 0, 0, 0]);
      frames[i] = { ...frames[i], edits };
    }
    return { frames };
  });
  return total;
}
