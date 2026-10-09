// Mini éditeur du résultat : crayon (couleur de la palette), gomme, pipette,
// annuler / rétablir. Il travaille sur store.edited, une copie du résultat.

import { cloneImage } from '../core/image.js';
import { watch } from './state.js';

const MAX_HISTORY = 100;

export function createEditor(store) {
  let undo = [];
  let redo = [];
  let snapshot = null; // état avant le trait en cours
  let last = null;     // dernière case touchée pendant le trait

  const publishHistory = () => store.set({ history: { undo: undo.length, redo: redo.length } });

  // nouvelle conversion → on repart du résultat brut, historique vidé
  watch(store, ['result'], ({ result }) => {
    undo = [];
    redo = [];
    store.set({ edited: result ? cloneImage(result.image) : null });
    publishHistory();
  });

  function paint(cell) {
    const { edited, tool, color } = store.get();
    if (!edited || !cell) return false;
    const i = (cell.y * edited.width + cell.x) * 4;
    const d = edited.data;
    if (tool === 'eraser') {
      if (d[i + 3] === 0) return false;
      d[i + 3] = 0;
      return true;
    }
    if (tool === 'pencil' && color) {
      if (d[i + 3] === 255 && d[i] === color[0] && d[i + 1] === color[1] && d[i + 2] === color[2]) return false;
      d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = 255;
      return true;
    }
    return false;
  }

  /** Toutes les cases entre a et b (Bresenham) : un geste rapide ne laisse pas de trous. */
  function* line(a, b) {
    let { x, y } = a;
    const dx = Math.abs(b.x - x), sx = x < b.x ? 1 : -1;
    const dy = -Math.abs(b.y - y), sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      yield { x, y };
      if (x === b.x && y === b.y) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  function pick(cell) {
    const { edited } = store.get();
    if (!edited || !cell) return;
    const i = (cell.y * edited.width + cell.x) * 4;
    if (edited.data[i + 3] === 0) return;
    store.set({ color: [edited.data[i], edited.data[i + 1], edited.data[i + 2]], tool: 'pencil' });
  }

  function onEditPointer(phase, cell) {
    const s = store.get();
    if (!s.edited) return;
    if (s.tool === 'picker') {
      if (phase === 'down') pick(cell);
      return;
    }
    if (phase === 'down') {
      snapshot = new Uint8ClampedArray(s.edited.data);
      last = cell;
      if (paint(cell)) bump();
    } else if (phase === 'move' && snapshot && cell) {
      let changed = false;
      for (const c of last ? line(last, cell) : [cell]) changed = paint(c) || changed;
      last = cell;
      if (changed) bump();
    } else if (phase === 'up' && snapshot) {
      if (!sameData(snapshot, store.get().edited.data)) {
        undo.push(snapshot);
        if (undo.length > MAX_HISTORY) undo.shift();
        redo = [];
        publishHistory();
      }
      snapshot = null;
      last = null;
    }
  }

  const bump = () => store.set((s) => ({ editVersion: s.editVersion + 1 }));

  function swap(from, to) {
    const { edited } = store.get();
    if (!from.length || !edited) return;
    to.push(new Uint8ClampedArray(edited.data));
    edited.data.set(from.pop());
    bump();
    publishHistory();
  }

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.closest?.('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); swap(undo, redo); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); swap(redo, undo); }
  });

  return {
    onEditPointer,
    undo: () => swap(undo, redo),
    redo: () => swap(redo, undo),
  };
}

function sameData(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
