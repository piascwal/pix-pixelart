// Projet d'animation : tout ce qu'il faut pour reprendre le travail plus tard, ou ailleurs
// (le sprite de départ, son découpage, les poses et retouches de chaque animation), dans un
// seul fichier JSON. Et la planche « pour le jeu » : une ligne par animation, toutes les
// images recadrées sur la même boîte (les pieds ne sautent pas d'une animation à l'autre).

import { createImage } from './image.js';
import { commonBounds } from './rig.js';

export const PROJECT_FORMAT = 'depix-animation';
export const PROJECT_VERSION = 1;

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const saveFrames = (frames) => frames.map((f) => ({ pose: f.pose, edits: [...f.edits].map(([i, c]) => [i, [...c]]) }));
const loadFrames = (list) => (list || []).map((f) => ({ pose: f.pose || {}, edits: new Map(f.edits || []) }));

/**
 * @param {{ base, rig, clips: Record<string, Array<{pose, edits: Map}>>, clip: string, fps: number, style?: string }} p
 * @returns {string} le JSON du projet
 */
export function serializeProject({ base, rig, clips, clip, fps, style }) {
  const out = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    base: { width: base.width, height: base.height, data: toBase64(new Uint8Array(base.data.buffer, base.data.byteOffset, base.data.length)) },
    rig: {
      labels: toBase64(rig.labels),
      parts: rig.parts.map(({ id, name, pivot, parent, pivotSet }) => ({ id, name, pivot, parent, pivotSet: !!pivotSet })),
      order: rig.order,
    },
    clips: Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, saveFrames(v)])),
    clip,
    fps,
    style,
  };
  return JSON.stringify(out);
}

/** @returns {{ base, rig, clips, clip, fps, style }} ; lève une erreur si le fichier n'est pas un projet */
export function parseProject(text) {
  const p = typeof text === 'string' ? JSON.parse(text) : text;
  if (!p || p.format !== PROJECT_FORMAT) throw new Error("Ce fichier n'est pas un projet d'animation Depix.");
  if (p.version > PROJECT_VERSION) throw new Error('Projet créé par une version plus récente de Depix.');
  const { width, height } = p.base;
  const data = new Uint8ClampedArray(fromBase64(p.base.data));
  const labels = fromBase64(p.rig.labels);
  if (data.length !== width * height * 4 || labels.length !== width * height) throw new Error('Projet abîmé : tailles incohérentes.');
  const base = { width, height, data };
  const rig = { width, height, labels, parts: p.rig.parts.map((q) => ({ ...q, pivot: { ...q.pivot } })), order: [...p.rig.order] };
  const clips = Object.fromEntries(Object.entries(p.clips || {}).map(([k, v]) => [k, loadFrames(v)]));
  return { base, rig, clips, clip: p.clip, fps: p.fps || 8, style: p.style };
}

/**
 * Planche pour le jeu : une ligne par animation (dans l'ordre de `names`), autant de colonnes
 * que l'animation la plus longue ; toutes les images sur la même boîte.
 * @param {Array<{ name: string, images: Array, fps: number }>} rows
 * @returns {{ image, meta: { frameWidth, frameHeight, animations: Array<{ name, row, frames, fps }> } }}
 */
export function gameSheet(rows) {
  const kept = rows.filter((r) => r.images.length);
  const b = commonBounds(kept.flatMap((r) => r.images));
  const cols = Math.max(1, ...kept.map((r) => r.images.length));
  const image = createImage(b.w * cols, b.h * Math.max(1, kept.length));
  kept.forEach((r, row) => {
    r.images.forEach((img, k) => {
      for (let y = 0; y < b.h; y++) {
        const from = ((b.y + y) * img.width + b.x) * 4;
        image.data.set(img.data.subarray(from, from + b.w * 4), ((row * b.h + y) * image.width + k * b.w) * 4);
      }
    });
  });
  return {
    image,
    meta: {
      frameWidth: b.w,
      frameHeight: b.h,
      animations: kept.map((r, row) => ({ name: r.name, row, frames: r.images.length, fps: r.fps })),
    },
  };
}
