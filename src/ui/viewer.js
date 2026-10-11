// Visionneuse avant / après : deux panneaux qui partagent la même caméra
// (zoom + position exprimés en pixels de l'image source). Le résultat est
// dessiné case par case par-dessus les mêmes coordonnées, donc l'original et
// sa conversion restent alignés quand on zoome ou qu'on se déplace.
//
// Gestes :
//   souris   glisser = déplacer · molette = zoom (Ctrl + molette si la page défile)
//   tactile  sans outil : la page défile normalement
//            avec un outil : 1 doigt = déplacer (main), dessiner ou tracer le rognage
//            2 doigts = pincer pour zoomer, glisser pour faire défiler la page

import { gridLines } from '../core/gridDetect.js';
import { watch } from './state.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 64;
const EDIT_TOOLS = new Set(['pencil', 'eraser', 'picker']);

/**
 * @param {{ original: HTMLCanvasElement, result: HTMLCanvasElement }} canvases
 * @param {object} store
 * @param {{ onEditPointer: (phase: 'down'|'move'|'up', cell: {x,y}|null) => void,
 *           onCropPointer: (phase: 'down'|'move'|'up'|'cancel', pt: {x,y}|null) => void,
 *           onInspect: (cell: {x,y}|null) => void }} hooks
 */
export function createViewer(canvases, store, hooks) {
  const cam = { scale: 1, cx: 0, cy: 0 };
  const resultBitmap = document.createElement('canvas');
  let frame = 0;

  const panes = Object.entries(canvases).map(([kind, canvas]) => ({
    kind, canvas, ctx: canvas.getContext('2d'), w: 0, h: 0,
  }));

  /* ------------------------------------------------------- coordonnées -- */

  const toScreen = (pane, sx, sy) => [
    (sx - cam.cx) * cam.scale + pane.w / 2,
    (sy - cam.cy) * cam.scale + pane.h / 2,
  ];
  const toSource = (pane, px, py) => [
    (px - pane.w / 2) / cam.scale + cam.cx,
    (py - pane.h / 2) / cam.scale + cam.cy,
  ];

  /** Indice i tel que edges[i] <= v < edges[i+1], ou -1. */
  function findCell(edges, v) {
    let lo = 0;
    let hi = edges.length - 2;
    if (hi < 0 || v < edges[0] || v >= edges[edges.length - 1]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (edges[mid] <= v) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function cellAt(pane, px, py) {
    const { result } = store.get();
    if (!result) return null;
    const [sx, sy] = toSource(pane, px, py);
    const x = findCell(result.lines.xs, sx);
    const y = findCell(result.lines.ys, sy);
    return x < 0 || y < 0 ? null : { x, y };
  }

  /* ------------------------------------------------------------ dessin -- */

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const ref = panes.find((p) => p.h > 0);   // un panneau déjà mesuré, pour suivre sa hauteur
    const refHeight = ref ? ref.h : 0;
    for (const p of panes) {
      p.w = p.canvas.clientWidth;
      p.h = p.canvas.clientHeight;
      const w = Math.max(1, Math.round(p.w * dpr));
      const h = Math.max(1, Math.round(p.h * dpr));
      // changer la taille efface le canvas : on ne le fait que si nécessaire,
      // et on redessine aussitôt pour éviter un écran vide d'une image
      if (p.canvas.width === w && p.canvas.height === h) continue;
      p.canvas.width = w;
      p.canvas.height = h;
    }
    // Quand la hauteur change (fiche d'une case, boutons de rognage qui apparaissent…),
    // l'image reste en place, ancrée en haut, au lieu de sauter de la moitié de l'écart.
    if (ref && ref.h > 0 && ref.h !== refHeight) cam.cy += (ref.h - refHeight) / (2 * cam.scale);
    for (const p of panes) if (p.w && p.h) draw(p);
  }

  function redraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const p of panes) if (p.w && p.h) draw(p);
    });
  }

  function draw(pane) {
    const { ctx } = pane;
    const s = store.get();
    const dpr = pane.canvas.width / pane.w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, pane.w, pane.h);
    if (!s.source) return;

    const [ox, oy] = toScreen(pane, 0, 0);
    ctx.imageSmoothingEnabled = cam.scale < 1;

    if (pane.kind === 'original') {
      ctx.drawImage(s.sourceBitmap, ox, oy, s.source.width * cam.scale, s.source.height * cam.scale);
      if (s.view.grid) drawGrid(pane, gridLines(s.settings, s.source.width, s.source.height), 'rgba(0, 255, 255, 0.55)', 4);
      if (s.result) drawFrame(pane, s.result.lines);
      if (s.cropSel) drawCropSelection(pane, s.cropSel, s.source);
      if (s.result && s.pixelSel) drawPixelSelection(pane, s.result.lines, s.pixelSel);
      return;
    }

    // panneau résultat : contour de l'original en filigrane, puis les cases
    ctx.globalAlpha = 0.12;
    ctx.drawImage(s.sourceBitmap, ox, oy, s.source.width * cam.scale, s.source.height * cam.scale);
    ctx.globalAlpha = 1;
    if (!s.result || !s.edited) return;
    const { xs, ys } = s.result.lines;
    const [x0, y0] = toScreen(pane, xs[0], ys[0]);
    const [x1, y1] = toScreen(pane, xs[xs.length - 1], ys[ys.length - 1]);
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    if (s.settings.output === 'magenta') {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(resultBitmap, x0, y0, x1 - x0, y1 - y0);
    // grille fine pour retoucher quand on est assez près
    if (EDIT_TOOLS.has(s.tool) && s.settings.period * cam.scale >= 10) {
      drawGrid(pane, s.result.lines, 'rgba(127, 127, 127, 0.35)', 10);
    }
    if (s.pixelSel) drawPixelSelection(pane, s.result.lines, s.pixelSel);
  }

  /** Contour de la case choisie avec le pointeur, visible sur n'importe quelle couleur. */
  function drawPixelSelection(pane, { xs, ys }, { x, y }) {
    if (x < 0 || y < 0 || x >= xs.length - 1 || y >= ys.length - 1) return;
    const { ctx } = pane;
    const [x0, y0] = toScreen(pane, xs[x], ys[y]);
    const [x1, y1] = toScreen(pane, xs[x + 1], ys[y + 1]);
    const w = Math.max(5, x1 - x0);
    const h = Math.max(5, y1 - y0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x0, y0, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x0, y0, w, h);
  }

  function drawGrid(pane, { xs, ys }, color, minSpacing) {
    const { ctx } = pane;
    if (store.get().settings.period * cam.scale < minSpacing) return;
    ctx.beginPath();
    const [top, bottom] = [toScreen(pane, 0, ys[0])[1], toScreen(pane, 0, ys[ys.length - 1])[1]];
    const [left, right] = [toScreen(pane, xs[0], 0)[0], toScreen(pane, xs[xs.length - 1], 0)[0]];
    for (const x of xs) {
      const X = Math.round(toScreen(pane, x, 0)[0]) + 0.5;
      if (X < -1 || X > pane.w + 1) continue;
      ctx.moveTo(X, Math.max(0, top));
      ctx.lineTo(X, Math.min(pane.h, bottom));
    }
    for (const y of ys) {
      const Y = Math.round(toScreen(pane, 0, y)[1]) + 0.5;
      if (Y < -1 || Y > pane.h + 1) continue;
      ctx.moveTo(Math.max(0, left), Y);
      ctx.lineTo(Math.min(pane.w, right), Y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Cadre jaune : la zone de l'original couverte par le résultat rogné. */
  function drawFrame(pane, { xs, ys }) {
    const { ctx } = pane;
    const [x0, y0] = toScreen(pane, xs[0], ys[0]);
    const [x1, y1] = toScreen(pane, xs[xs.length - 1], ys[ys.length - 1]);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
    ctx.setLineDash([]);
  }

  /** Rectangle de rognage : l'extérieur est assombri. */
  function drawCropSelection(pane, sel, source) {
    const { ctx } = pane;
    const [x0, y0] = toScreen(pane, sel.x, sel.y);
    const [x1, y1] = toScreen(pane, sel.x + sel.w, sel.y + sel.h);
    const [ix0, iy0] = toScreen(pane, 0, 0);
    const [ix1, iy1] = toScreen(pane, source.width, source.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(ix0, iy0, ix1 - ix0, y0 - iy0);                 // haut
    ctx.fillRect(ix0, y1, ix1 - ix0, iy1 - y1);                  // bas
    ctx.fillRect(ix0, y0, x0 - ix0, y1 - y0);                    // gauche
    ctx.fillRect(x1, y0, ix1 - x1, y1 - y0);                     // droite
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
    ctx.setLineDash([]);
  }

  function updateResultBitmap() {
    const { edited } = store.get();
    if (!edited) return;
    resultBitmap.width = edited.width;
    resultBitmap.height = edited.height;
    if (edited.width && edited.height) {
      resultBitmap.getContext('2d').putImageData(new ImageData(edited.data, edited.width, edited.height), 0, 0);
    }
  }

  /* ------------------------------------------------------------ caméra -- */

  function zoomAt(pane, factor, px, py) {
    const [sx, sy] = toSource(pane, px, py);
    cam.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
    // garde le point sous le curseur immobile
    cam.cx = sx - (px - pane.w / 2) / cam.scale;
    cam.cy = sy - (py - pane.h / 2) / cam.scale;
    redraw();
  }

  function zoomCenter(factor) {
    const pane = panes.find((p) => p.w);
    if (pane) zoomAt(pane, factor, pane.w / 2, pane.h / 2);
  }

  /** Cadre une zone (en pixels source) dans le plus petit panneau visible. */
  function fit(rect) {
    const visible = panes.filter((p) => p.w && p.h);
    if (!visible.length || !rect.w || !rect.h) return;
    const w = Math.min(...visible.map((p) => p.w));
    const h = Math.min(...visible.map((p) => p.h));
    cam.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, 0.92 * Math.min(w / rect.w, h / rect.h)));
    cam.cx = rect.x + rect.w / 2;
    cam.cy = rect.y + rect.h / 2;
    redraw();
  }

  /** Cadre le sprite (sans les poussières éloignées), ou l'image entière à défaut. */
  function fitBest() {
    const { result, source } = store.get();
    if (result && result.image.width && result.image.height) {
      const { xs, ys } = result.lines;
      const f = result.focus || { x0: 0, y0: 0, x1: xs.length - 1, y1: ys.length - 1 };
      fit({ x: xs[f.x0], y: ys[f.y0], w: xs[f.x1] - xs[f.x0], h: ys[f.y1] - ys[f.y0] });
    } else if (source) {
      fit({ x: 0, y: 0, w: source.width, h: source.height });
    }
  }

  /* ---------------------------------------------------- interactions -- */

  for (const pane of panes) {
    const { canvas } = pane;
    const pointers = new Map(); // id → position à l'écran (clientX / clientY)
    let pinch = null;
    let gesture = null;         // 'edit' | 'crop' | null
    let tap = null;             // pointeur : appui qui n'a pas bougé = sélection d'une case

    const localOf = (x, y) => {
      const r = canvas.getBoundingClientRect();
      return [x - r.left, y - r.top];
    };
    const sourcePoint = (e) => {
      const [sx, sy] = toSource(pane, ...localOf(e.clientX, e.clientY));
      return { x: sx, y: sy };
    };

    function endGesture() {
      if (gesture === 'edit') hooks.onEditPointer('up', null);
      else if (gesture === 'crop') hooks.onCropPointer('cancel', null);
      gesture = null;
    }

    canvas.addEventListener('wheel', (e) => {
      // si la page défile (téléphone, petite fenêtre), la molette la fait défiler ;
      // Ctrl + molette (ou pincement au pavé tactile) zoome dans tous les cas
      const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 1;
      const zoomKey = e.ctrlKey || e.metaKey;
      if (pageScrolls && !zoomKey) return;
      e.preventDefault();
      const [px, py] = localOf(e.clientX, e.clientY);
      const speed = zoomKey ? 0.01 : 0.0018;
      zoomAt(pane, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 30 : 1) * speed), px, py);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      // sans outil, un doigt ou un stylet ne touche pas à l'image : le navigateur
      // fait défiler la page (CSS touch-action: auto). La souris peut toujours déplacer.
      if (e.pointerType !== 'mouse' && store.get().tool === 'none') return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        endGesture();
        tap = null;
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
        return;
      }
      if (pointers.size > 2 || e.button !== 0) return;
      const { tool } = store.get();
      if (pane.kind === 'result' && EDIT_TOOLS.has(tool)) {
        gesture = 'edit';
        hooks.onEditPointer('down', cellAt(pane, ...localOf(e.clientX, e.clientY)));
      } else if (pane.kind === 'original' && tool === 'crop') {
        gesture = 'crop';
        hooks.onCropPointer('down', sourcePoint(e));
      } else if (tool === 'inspect') {
        tap = { x: e.clientX, y: e.clientY };
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      // un appui qui glisse est un déplacement, pas une sélection
      if (tap && Math.hypot(cur.x - tap.x, cur.y - tap.y) > 8) tap = null;

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        // glisser à deux doigts fait défiler la page, écarter / pincer zoome
        window.scrollBy(pinch.mid[0] - mid[0], pinch.mid[1] - mid[1]);
        if (pinch.dist > 0 && dist > 0) zoomAt(pane, dist / pinch.dist, ...localOf(mid[0], mid[1]));
        pinch = { dist, mid };
      } else if (gesture === 'edit') {
        hooks.onEditPointer('move', cellAt(pane, ...localOf(cur.x, cur.y)));
      } else if (gesture === 'crop') {
        hooks.onCropPointer('move', sourcePoint(e));
      } else if (pointers.size === 1 && !tap) {
        cam.cx -= (cur.x - prev.x) / cam.scale;
        cam.cy -= (cur.y - prev.y) / cam.scale;
        redraw();
      }
    });

    const release = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (gesture === 'edit') hooks.onEditPointer('up', null);
        else if (gesture === 'crop') hooks.onCropPointer('up', null);
        else if (tap && e.type === 'pointerup') hooks.onInspect(cellAt(pane, ...localOf(e.clientX, e.clientY)));
        gesture = null;
        tap = null;
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  const observer = new ResizeObserver(resize);
  for (const p of panes) observer.observe(p.canvas);
  window.addEventListener('resize', resize);

  /* ----------------------------------------------------- abonnements -- */

  let fitNextResult = false;
  watch(store, ['source'], () => {
    resize();
    const { source } = store.get();
    if (source) fit({ x: 0, y: 0, w: source.width, h: source.height });
    fitNextResult = true;
  });
  watch(store, ['result'], () => {
    if (fitNextResult && store.get().result) { fitNextResult = false; fitBest(); }
  });
  watch(store, ['edited', 'editVersion'], () => { updateResultBitmap(); redraw(); });
  watch(store, ['settings', 'view', 'tool', 'cropSel', 'pixelSel'], redraw);
  watch(store, ['view'], () => requestAnimationFrame(resize));

  resize();

  return {
    zoomIn: () => zoomCenter(1.5),
    zoomOut: () => zoomCenter(1 / 1.5),
    fit: fitBest,
    fitAll: () => { const { source } = store.get(); if (source) fit({ x: 0, y: 0, w: source.width, h: source.height }); },
    redraw,
  };
}
