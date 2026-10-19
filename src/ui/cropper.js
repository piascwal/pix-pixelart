// Rognage : en choisissant l'outil « Rogner », une zone apparaît déjà (celle du sprite, calée sur les
// cases de la grille) avec huit poignées : les quatre coins et le milieu des quatre bords. Seules les
// poignées changent la zone ; partout ailleurs, glisser déplace l'image (la main), et on zoome là où l'on
// pointe, autant qu'on veut, jusqu'à valider : la zone devient l'image de travail (grille, fond et palette
// sont ré-analysés dessus). « Image entière » restaure l'original.
// Ce module gère la sélection et ses boutons ; app.js applique le rognage.

import { gridLines } from '../core/gridDetect.js';
import { watch } from './state.js';

const MIN_SIZE = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} store
 * @param {{ applyBtn, cancelBtn, resetBtn, actions: HTMLElement,
 *           onApply: (rect) => void, onReset: () => void,
 *           grille: () => ({period, offsetX, offsetY} | null) }} ui
 *   ui.grille : la grille de l'image (null en mode « taille choisie » : pas de cases à respecter)
 * @returns {{ onCropPointer: (phase: 'down'|'move'|'up'|'cancel', pt: {x,y,tol}|null) => boolean|void,
 *             cursor: (pt: {x,y,tol}) => string }}
 *   `down` rend true si le point touche une poignée (le geste est alors pour le rognage), false sinon (c'est la main) ;
 *   pt.tol : la prise sur une poignée, en pixels de la source (14 à 24 px d'écran, selon le zoom)
 */
export function createCropper(store, ui) {
  // la poignée en cours de tirage : { bords: {l, r, t, b}, avant }
  let geste = null;

  const plusProche = (lignes, v) => lignes.reduce((m, l) => (Math.abs(l - v) < Math.abs(m - v) ? l : m), lignes[0]);

  /**
   * La zone calée sur les cases de la grille : chaque bord va à la ligne de grille la plus proche. Une zone qui
   * coupe une case en deux donnerait, une fois rognée, une grille décalée d'une demi-case (deux couleurs par case).
   */
  function cale(sel) {
    const { source } = store.get();
    const g = ui.grille?.();
    if (!sel || !source || !g) return sel;
    let lignes;
    try {
      lignes = gridLines(g, source.width, source.height);
    } catch {
      return sel; // grille inutilisable (taille de case absurde) : pas de calage
    }
    const { xs, ys } = lignes;
    if (xs.length < 2 || ys.length < 2) return sel;
    const bords = (l, a, b) => {
      let l0 = plusProche(l, a);
      let l1 = plusProche(l, b);
      if (l1 <= l0) l1 = l[l.indexOf(l0) + 1] ?? l0; // au moins une case
      if (l1 <= l0) l0 = l[l.indexOf(l1) - 1] ?? l1;
      return [l0, l1];
    };
    const [x0, x1] = bords(xs, sel.x, sel.x + sel.w);
    const [y0, y1] = bords(ys, sel.y, sel.y + sel.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Les huit poignées d'une zone : { l, r, t, b } à true pour les bords qu'elle tire (un coin en tire deux). */
  function poignees(sel) {
    const mx = sel.x + sel.w / 2;
    const my = sel.y + sel.h / 2;
    return [
      [sel.x, sel.y, { l: true, t: true }],
      [mx, sel.y, { t: true }],
      [sel.x + sel.w, sel.y, { r: true, t: true }],
      [sel.x, my, { l: true }],
      [sel.x + sel.w, my, { r: true }],
      [sel.x, sel.y + sel.h, { l: true, b: true }],
      [mx, sel.y + sel.h, { b: true }],
      [sel.x + sel.w, sel.y + sel.h, { r: true, b: true }],
    ];
  }

  /** La poignée touchée par le point (la plus proche dans la tolérance), ou null. */
  function saisie(sel, pt) {
    if (!sel) return null;
    let meilleure = null;
    let dMin = Infinity;
    for (const [x, y, bords] of poignees(sel)) {
      const dx = Math.abs(pt.x - x);
      const dy = Math.abs(pt.y - y);
      if (dx > (pt.tol ?? 0) || dy > (pt.tol ?? 0)) continue;
      if (dx + dy < dMin) {
        dMin = dx + dy;
        meilleure = bords;
      }
    }
    return meilleure;
  }

  /** Le curseur au survol (souris) : la flèche de la poignée ; sinon rien (la main de l'outil). */
  function cursor(pt) {
    const g = saisie(store.get().cropSel, pt);
    if (!g) return '';
    if ((g.l && g.t) || (g.r && g.b)) return 'nwse-resize';
    if ((g.r && g.t) || (g.l && g.b)) return 'nesw-resize';
    return g.l || g.r ? 'ew-resize' : 'ns-resize';
  }

  function onCropPointer(phase, pt) {
    const { source, cropSel } = store.get();
    if (!source) return false;
    if (phase === 'down') {
      const bords = saisie(cropSel, pt);
      geste = bords ? { bords, avant: cropSel } : null;
      return Boolean(bords);
    }
    if (phase === 'move' && geste) {
      const p = { x: clamp(pt.x, 0, source.width), y: clamp(pt.y, 0, source.height) };
      const { avant, bords } = geste;
      const x0 = bords.l ? Math.round(p.x) : avant.x;
      const x1 = bords.r ? Math.round(p.x) : avant.x + avant.w;
      const y0 = bords.t ? Math.round(p.y) : avant.y;
      const y1 = bords.b ? Math.round(p.y) : avant.y + avant.h;
      // on ne retourne pas la zone : un bord s'arrête à MIN_SIZE du bord opposé
      const gauche = bords.l ? Math.min(x0, x1 - MIN_SIZE) : x0;
      const droite = bords.r ? Math.max(x1, x0 + MIN_SIZE) : x1;
      const haut = bords.t ? Math.min(y0, y1 - MIN_SIZE) : y0;
      const bas = bords.b ? Math.max(y1, y0 + MIN_SIZE) : y1;
      store.set({ cropSel: cale({ x: gauche, y: haut, w: droite - gauche, h: bas - haut }) });
    } else if (phase === 'up') {
      geste = null;
    } else if (phase === 'cancel' && geste) {
      // geste interrompu (pincement, appui long) : la zone redevient ce qu'elle était
      store.set({ cropSel: geste.avant });
      geste = null;
    }
    return false;
  }

  const apply = () => {
    const { cropSel } = store.get();
    if (cropSel) ui.onApply(cropSel);
  };
  const abandonne = () => store.set({ cropSel: null, tool: 'none' });
  ui.applyBtn.addEventListener('click', apply);
  ui.cancelBtn.addEventListener('click', abandonne);
  ui.resetBtn.addEventListener('click', () => ui.onReset());

  window.addEventListener('keydown', (e) => {
    if (store.get().tool !== 'crop' || e.target.closest?.('input, textarea')) return;
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') abandonne();
  });

  /** La zone de départ : celle du sprite (le cadre jaune en pointillés), calée sur les cases ; sinon l'image entière. */
  function zoneDeDepart() {
    const { result, source } = store.get();
    let zone = { x: 0, y: 0, w: source.width, h: source.height };
    if (result?.lines && result.focus) {
      const { xs, ys } = result.lines;
      const { x0, y0, x1, y1 } = result.focus;
      const w = (xs[x1] ?? source.width) - xs[x0];
      const h = (ys[y1] ?? source.height) - ys[y0];
      if (w >= MIN_SIZE && h >= MIN_SIZE) zone = { x: xs[x0], y: ys[y0], w, h };
    }
    return cale(zone);
  }

  // l'outil « Rogner » a toujours une zone : il la prend au sprite ; un autre outil l'abandonne, sauf la main et « aucun » :
  // se déplacer dans l'image n'est pas renoncer au rognage
  watch(store, ['tool', 'source', 'result'], (s) => {
    if (s.tool === 'crop' && s.source && !s.cropSel && s.result) store.set({ cropSel: zoneDeDepart() });
    else if (!['crop', 'move', 'none'].includes(s.tool) && s.cropSel) store.set({ cropSel: null });
  });

  function render() {
    const { cropSel, original, source } = store.get();
    ui.actions.hidden = !cropSel;
    ui.resetBtn.hidden = !original || source === original.image;
  }
  watch(store, ['cropSel', 'original', 'source'], render);
  render();

  return { onCropPointer, cursor };
}
