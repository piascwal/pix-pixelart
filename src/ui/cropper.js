// Rognage : on trace un rectangle sur l'original (outil « Rogner »), puis on le
// retouche aussi longtemps qu'on veut : tirer un bord ou un coin, déplacer la zone
// (on peut zoomer, dézoomer et défiler entre deux gestes) ; on valide ensuite ;
// la zone devient l'image de travail (grille, fond et palette sont
// ré-analysés dessus). « Image entière » restaure l'original.
// Ce module gère la sélection et ses boutons ; app.js applique le rognage.

import { watch } from './state.js';

const MIN_SIZE = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} store
 * @param {{ applyBtn, cancelBtn, resetBtn, actions: HTMLElement,
 *           onApply: (rect) => void, onReset: () => void }} ui
 * @returns {{ onCropPointer: (phase: 'down'|'move'|'up'|'cancel', pt: {x,y,tol}|null) => void,
 *             cursor: (pt: {x,y,tol}) => string }}
 *   pt.tol : la tolérance de saisie d'un bord, en pixels de la source (8 à 16 px d'écran, selon le zoom)
 */
export function createCropper(store, ui) {
  // le geste en cours : tracer une nouvelle zone, tirer des bords, ou déplacer la zone
  let geste = null;

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

  /**
   * Ce que le point touche de la zone : { l, r, t, b } (bords tirés ; deux à la fois = un coin),
   * { dedans: true } pour la déplacer, ou null. La tolérance ne mange jamais plus d'un tiers de la zone.
   */
  function saisie(sel, pt) {
    if (!sel) return null;
    const tol = Math.min(pt.tol ?? 0, sel.w / 3, sel.h / 3);
    const dansX = pt.x >= sel.x - tol && pt.x <= sel.x + sel.w + tol;
    const dansY = pt.y >= sel.y - tol && pt.y <= sel.y + sel.h + tol;
    const bords = {
      l: dansY && Math.abs(pt.x - sel.x) <= tol,
      r: dansY && Math.abs(pt.x - (sel.x + sel.w)) <= tol,
      t: dansX && Math.abs(pt.y - sel.y) <= tol,
      b: dansX && Math.abs(pt.y - (sel.y + sel.h)) <= tol,
    };
    if (bords.l && bords.r) bords.r = pt.x - sel.x > sel.x + sel.w - pt.x;
    if (bords.l && bords.r) bords.l = false;
    if (bords.t && bords.b) bords.b = pt.y - sel.y > sel.y + sel.h - pt.y;
    if (bords.t && bords.b) bords.t = false;
    if (bords.l || bords.r || bords.t || bords.b) return bords;
    const dedans = pt.x > sel.x && pt.x < sel.x + sel.w && pt.y > sel.y && pt.y < sel.y + sel.h;
    return dedans ? { dedans: true } : null;
  }

  /** Le curseur à montrer au survol (souris) : la flèche du bord, la main pour déplacer, le réticule pour tracer. */
  function cursor(pt) {
    const g = saisie(store.get().cropSel, pt);
    if (!g) return 'crosshair';
    if (g.dedans) return 'move';
    if ((g.l && g.t) || (g.r && g.b)) return 'nwse-resize';
    if ((g.r && g.t) || (g.l && g.b)) return 'nesw-resize';
    return g.l || g.r ? 'ew-resize' : 'ns-resize';
  }

  function onCropPointer(phase, pt) {
    const { source, cropSel } = store.get();
    if (!source) return;
    if (phase === 'down') {
      const g = saisie(cropSel, pt);
      const depart = bounded(pt, source);
      // une zone existe : on la reprend (bords, déplacement) ; sinon, ou en dehors, on en trace une nouvelle
      geste = { avant: cropSel, depart, tire: g && !g.dedans ? g : null, deplace: Boolean(g?.dedans), neuf: !g, bouge: false };
    } else if (phase === 'move' && geste) {
      const p = bounded(pt, source);
      const { avant, tire } = geste;
      geste.bouge = true;
      if (tire) {
        const x0 = tire.l ? Math.round(p.x) : avant.x;
        const x1 = tire.r ? Math.round(p.x) : avant.x + avant.w;
        const y0 = tire.t ? Math.round(p.y) : avant.y;
        const y1 = tire.b ? Math.round(p.y) : avant.y + avant.h;
        // on ne retourne pas la zone : un bord s'arrête à MIN_SIZE du bord opposé
        const gauche = tire.l ? Math.min(x0, x1 - MIN_SIZE) : x0;
        const droite = tire.r ? Math.max(x1, x0 + MIN_SIZE) : x1;
        const haut = tire.t ? Math.min(y0, y1 - MIN_SIZE) : y0;
        const bas = tire.b ? Math.max(y1, y0 + MIN_SIZE) : y1;
        store.set({ cropSel: { x: gauche, y: haut, w: droite - gauche, h: bas - haut } });
      } else if (geste.deplace) {
        const x = clamp(avant.x + Math.round(p.x - geste.depart.x), 0, source.width - avant.w);
        const y = clamp(avant.y + Math.round(p.y - geste.depart.y), 0, source.height - avant.h);
        store.set({ cropSel: { ...avant, x, y } });
      } else {
        // une nouvelle zone ne remplace l'ancienne qu'une fois le geste commencé (un simple appui, un pincement : rien ne change)
        store.set({ cropSel: selection(geste.depart, p) });
      }
    } else if (phase === 'up' && geste) {
      const sel = store.get().cropSel;
      const g = geste;
      geste = null;
      // une nouvelle zone trop petite est abandonnée : on retrouve l'ancienne
      if (g.bouge && g.neuf !== false && (!sel || sel.w < MIN_SIZE || sel.h < MIN_SIZE)) store.set({ cropSel: g.avant });
    } else if (phase === 'cancel' && geste) {
      // geste interrompu (pincement, appui long) : la zone redevient ce qu'elle était
      store.set({ cropSel: geste.avant });
      geste = null;
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

  // changer d'outil abandonne la sélection, sauf la main et « aucun outil » : se déplacer dans l'image n'est pas y renoncer
  watch(store, ['tool'], (s) => { if (!['crop', 'move', 'none'].includes(s.tool) && s.cropSel) store.set({ cropSel: null }); });

  function render() {
    const { cropSel, original, source } = store.get();
    ui.actions.hidden = !cropSel;
    ui.resetBtn.hidden = !original || source === original.image;
  }
  watch(store, ['cropSel', 'original', 'source'], render);
  render();

  return { onCropPointer, cursor };
}
