// Visionneuse avant / après : deux panneaux qui partagent la même caméra
// (zoom + position exprimés en pixels de l'image source). Le résultat est
// dessiné case par case par-dessus les mêmes coordonnées, donc l'original et
// sa conversion restent alignés quand on zoome ou qu'on se déplace.

import { gridLines } from '../core/gridDetect.js';
import { watch } from './state.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 64;

/**
 * @param {{ original: HTMLCanvasElement, result: HTMLCanvasElement }} canvases
 * @param {object} store
 * @param {{ onEditPointer: (phase: 'down'|'move'|'up', cell: {x,y}|null) => void }} hooks
 *   appelé quand on dessine sur le résultat avec un outil d'édition
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
      if (p.w && p.h) draw(p);
    }
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
    if (s.tool !== 'move' && s.settings.period * cam.scale >= 10) {
      drawGrid(pane, s.result.lines, 'rgba(127, 127, 127, 0.35)', 10);
    }
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

  function fitBest() {
    const { result, source } = store.get();
    if (result && result.image.width) {
      const { xs, ys } = result.lines;
      fit({ x: xs[0], y: ys[0], w: xs[xs.length - 1] - xs[0], h: ys[ys.length - 1] - ys[0] });
    } else if (source) {
      fit({ x: 0, y: 0, w: source.width, h: source.height });
    }
  }

  /* ---------------------------------------------------- interactions -- */

  for (const pane of panes) {
    const { canvas } = pane;
    const pointers = new Map();
    let pinch = null;
    let drawing = false;

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [px, py] = local(e);
      zoomAt(pane, Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)), px, py);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 2) {
        if (drawing) { drawing = false; hooks.onEditPointer('up', null); }
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        return;
      }
      const editing = pane.kind === 'result' && store.get().tool !== 'move' && e.button === 0;
      if (editing) {
        drawing = true;
        hooks.onEditPointer('down', cellAt(pane, ...local(e)));
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        canvas.style.cursor = pane.kind === 'result' && store.get().tool !== 'move' ? 'crosshair' : 'grab';
        return;
      }
      const prev = pointers.get(e.pointerId);
      const cur = local(e);
      pointers.set(e.pointerId, cur);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        cam.cx -= (mid[0] - pinch.mid[0]) / cam.scale;
        cam.cy -= (mid[1] - pinch.mid[1]) / cam.scale;
        if (pinch.dist > 0) zoomAt(pane, dist / pinch.dist, mid[0], mid[1]);
        pinch = { dist, mid };
        redraw();
      } else if (drawing) {
        hooks.onEditPointer('move', cellAt(pane, ...cur));
      } else if (pointers.size === 1) {
        cam.cx -= (cur[0] - prev[0]) / cam.scale;
        cam.cy -= (cur[1] - prev[1]) / cam.scale;
        redraw();
      }
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drawing && pointers.size === 0) {
        drawing = false;
        hooks.onEditPointer('up', null);
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  const observer = new ResizeObserver(resize);
  for (const p of panes) observer.observe(p.canvas);
  window.addEventListener('resize', resize);

  /* ----------------------------------------------------- abonnements -- */

  watch(store, ['source'], () => {
    resize();
    const { source } = store.get();
    if (source) fit({ x: 0, y: 0, w: source.width, h: source.height });
  });
  let fitNextResult = false;
  watch(store, ['source'], () => { fitNextResult = true; });
  watch(store, ['result'], () => {
    if (fitNextResult && store.get().result) { fitNextResult = false; fitBest(); }
  });
  watch(store, ['edited', 'editVersion'], () => { updateResultBitmap(); redraw(); });
  watch(store, ['settings', 'view', 'tool'], redraw);
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
