// Rognage : on trace un rectangle sur l'original (outil « Rogner »), puis on
// valide ; la zone devient l'image de travail (grille, fond et palette sont
// ré-analysés dessus). « Image entière » restaure l'original.
// Ce module gère la sélection et ses boutons ; app.js applique le rognage.

import { watch } from './state.js';

const MIN_SIZE = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} store
 * @param {{ applyBtn, cancelBtn, resetBtn, actions: HTMLElement,
 *           onApply: (rect) => void, onReset: () => void }} ui
 * @returns {{ onCropPointer: (phase: 'down'|'move'|'up'|'cancel', pt: {x,y}|null) => void }}
 */
export function createCropper(store, ui) {
  let start = null;

  const bounded = (pt, source) => ({
    x: clamp(pt.x, 0, source.width),
    y: clamp(pt.y, 0, source.height),
  });

  function selection(a, b) {
    const x0 = Math.floor(Math.min(a.x, b.x));
    const y0 = Math.floor(Math.min(a.y, b.y));
    const x1 = Math.ceil(Math.max(a.x, b.x));
    const y1 = Math.ceil(Math.max(a.y, b.y));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function onCropPointer(phase, pt) {
    const { source } = store.get();
    if (!source) return;
    if (phase === 'down') {
      start = bounded(pt, source);
      store.set({ cropSel: null });
    } else if (phase === 'move' && start) {
      store.set({ cropSel: selection(start, bounded(pt, source)) });
    } else if (phase === 'up' && start) {
      const sel = store.get().cropSel;
      start = null;
      if (!sel || sel.w < MIN_SIZE || sel.h < MIN_SIZE) store.set({ cropSel: null });
    } else if (phase === 'cancel') {
      start = null;
      store.set({ cropSel: null });
    }
  }

  const apply = () => {
    const { cropSel } = store.get();
    if (cropSel) ui.onApply(cropSel);
  };
  ui.applyBtn.addEventListener('click', apply);
  ui.cancelBtn.addEventListener('click', () => store.set({ cropSel: null }));
  ui.resetBtn.addEventListener('click', () => ui.onReset());

  window.addEventListener('keydown', (e) => {
    if (store.get().tool !== 'crop' || e.target.closest?.('input, textarea')) return;
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') store.set({ cropSel: null });
  });

  // quitter l'outil abandonne la sélection
  watch(store, ['tool'], (s) => { if (s.tool !== 'crop' && s.cropSel) store.set({ cropSel: null }); });

  function render() {
    const { cropSel, original, source } = store.get();
    ui.actions.hidden = !cropSel;
    ui.resetBtn.hidden = !original || source === original.image;
  }
  watch(store, ['cropSel', 'original', 'source'], render);
  render();

  return { onCropPointer };
}
