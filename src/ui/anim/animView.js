// Canevas du mode Animation, avec une caméra (zoom + position de la vue) qui
// ne touche jamais au personnage.
//   Vue      : molette ou pincement = zoom à l'endroit visé ; main, barre
//              d'espace, clic milieu ou deux doigts = déplacer la vue.
//   Découper : le sprite, chaque pièce teintée de sa couleur, pivots et squelette ;
//              pinceau (attribuer à la pièce choisie), gomme (rendre au corps), pivot.
//   Poser    : attraper un membre et glisser le fait tourner autour de son pivot ;
//              maintien long sur un membre (sans bouger) puis glisser : il se déplace
//              en X / Y ; relâcher revient à la rotation. Glisser sur le corps ou dans le vide déplace la vue (le décalage du
//              corps se règle dans le panneau).
//   Retoucher: crayon, gomme, pipette sur l'image courante.

import { worldTransforms, apply, marginFor, BODY } from '../../core/rig.js';
import { watch } from '../state.js';
import {
  anim, commit, paintAt, placePivot, setPose, setEdit, frameImage, partColor,
} from './animStore.js';

const MIN_SCALE = 0.5;
const MAX_SCALE = 64;
const HOLD_MS = 450;   // maintien long : déplacer le membre en X / Y
const HOLD_SLOP = 6;   // px d'écran tolérés pendant le maintien

export function createAnimView(canvas, container) {
  const ctx = canvas.getContext('2d');
  const sprite = document.createElement('canvas');
  const onionCanvas = document.createElement('canvas');
  const cam = { scale: 1, cx: 0, cy: 0 };
  let W = 0, H = 0;
  let fittedFor = '';
  let playIndex = 0;
  let timer = 0;
  let spaceDown = false;
  let holdTimer = 0;

  /** Image affichée (pose + retouches) ; même taille pour toutes les images, marge comprise. */
  function current() {
    const s = anim.get();
    return frameImage(s.frames[s.playing ? playIndex : s.current]);
  }

  /* ------------------------------------------------------------ caméra */

  const toScreen = (x, y) => [(x - cam.cx) * cam.scale + W / 2, (y - cam.cy) * cam.scale + H / 2];
  const toImage = (sx, sy) => [(sx - W / 2) / cam.scale + cam.cx, (sy - H / 2) / cam.scale + cam.cy];

  function fit() {
    const { image } = current();
    if (!W || !H) return;
    let s = 0.92 * Math.min(W / image.width, H / image.height);
    if (s >= 1) s = Math.floor(s);            // cases nettes quand c'est possible
    cam.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    cam.cx = image.width / 2;
    cam.cy = image.height / 2;
    redraw();
  }

  function zoomAt(factor, sx, sy) {
    const [ix, iy] = toImage(sx, sy);
    cam.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor));
    // le point visé reste sous le doigt / le curseur
    cam.cx = ix - (sx - W / 2) / cam.scale;
    cam.cy = iy - (sy - H / 2) / cam.scale;
    redraw();
  }

  function panBy(dx, dy) {
    cam.cx -= dx / cam.scale;
    cam.cy -= dy / cam.scale;
    redraw();
  }

  /* ------------------------------------------------------------ dessin */

  function resize() {
    W = container.clientWidth;
    H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    draw();
  }

  function draw() {
    const s = anim.get();
    if (!s.active || !s.base || !W || !H) return;
    const { image, margin: m } = current();
    const key = `${image.width}x${image.height}:${s.base.width}x${s.base.height}`;
    if (fittedFor !== key) { fittedFor = key; fit(); return; }

    canvas.dataset.view = `${cam.cx},${cam.cy},${cam.scale}`;
    const dpr = canvas.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = cam.scale < 1;
    const k = cam.scale;

    if (s.step === 'cut' && !s.playing) {
      // le sprite au repos, pièces teintées
      sprite.width = s.base.width; sprite.height = s.base.height;
      sprite.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.base.data), s.base.width, s.base.height), 0, 0);
      const [ox, oy] = toScreen(m, m);
      ctx.drawImage(sprite, ox, oy, s.base.width * k, s.base.height * k);
      const { rig } = s;
      for (let i = 0; i < rig.labels.length; i++) {
        const id = rig.labels[i];
        if (id === BODY || !s.base.data[i * 4 + 3]) continue;
        const x = i % rig.width, y = (i - x) / rig.width;
        const [px, py] = toScreen(x + m, y + m);
        ctx.globalAlpha = id === s.selected ? 0.6 : 0.35;
        ctx.fillStyle = partColor(id);
        ctx.fillRect(px, py, k, k);
      }
      ctx.globalAlpha = 1;
      drawSkeleton(s.rig, (p) => ({ x: p.pivot.x + m, y: p.pivot.y + m }));
    } else {
      sprite.width = image.width; sprite.height = image.height;
      sprite.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
      const [ox, oy] = toScreen(0, 0);
      if (s.onion && !s.playing && s.frames.length > 1) {
        // pelure d'oignon : la pose d'avant en bleu, celle d'après en vert, sous l'image courante
        const n = s.frames.length;
        for (const [idx, tint, alpha] of [[(s.current - 1 + n) % n, '#3b8bff', 0.5], [(s.current + 1) % n, '#2fd47a', 0.4]]) {
          if (idx === s.current) continue;
          const o = frameImage(s.frames[idx]).image;
          onionCanvas.width = o.width; onionCanvas.height = o.height;
          const oc = onionCanvas.getContext('2d');
          oc.putImageData(new ImageData(new Uint8ClampedArray(o.data), o.width, o.height), 0, 0);
          oc.globalCompositeOperation = 'source-atop';
          oc.fillStyle = tint;
          oc.fillRect(0, 0, o.width, o.height);
          oc.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = alpha;
          ctx.drawImage(onionCanvas, ox, oy, o.width * k, o.height * k);
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(sprite, ox, oy, image.width * k, image.height * k);
      if (s.step === 'pose' && !s.playing) {
        const world = worldTransforms(s.rig, s.frames[s.current].pose, { x: m, y: m });
        drawSkeleton(s.rig, (p) => apply(world.get(p.id).m, p.pivot));
      }
    }
    canvas.dataset.view = `${cam.cx.toFixed(2)},${cam.cy.toFixed(2)},${cam.scale.toFixed(3)}`;
  }

  /** Pivots (cercles) reliés à celui du parent ; la pièce choisie est mise en avant. */
  function drawSkeleton(rig, at) {
    const s = anim.get();
    const pos = new Map(rig.parts.map((p) => [p.id, toScreen(at(p).x, at(p).y)]));
    ctx.lineWidth = 1.5;
    for (const p of rig.parts) {
      // pas de trait vers le corps : seuls les liens entre membres aident à lire le squelette
      if (p.id === BODY || p.parent === null || p.parent === undefined || p.parent === BODY) continue;
      const a = pos.get(p.id), b = pos.get(p.parent);
      if (!b) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (const p of rig.parts) {
      if (p.id === BODY) continue;
      const [cx, cy] = pos.get(p.id);
      const r = Math.max(4, Math.min(10, cam.scale * 0.9)) * (p.id === s.selected ? 1.4 : 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = partColor(p.id);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.id === s.selected ? '#fff' : '#000';
      if (!p.pivotSet) ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* -------------------------------------------------------------- gestes */

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  /** Pixel de l'image sous le pointeur (coordonnées entières et continues). */
  const pixelAt = (e) => {
    const [fx, fy] = toImage(...local(e));
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  };

  function line(a, b, fn) {
    let { x, y } = a;
    const dx = Math.abs(b.x - x), sx = x < b.x ? 1 : -1;
    const dy = -Math.abs(b.y - y), sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      fn(x, y);
      if (x === b.x && y === b.y) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  const pointers = new Map();   // id → position à l'écran
  let pinch = null;
  let drag = null;

  canvas.addEventListener('wheel', (e) => {
    if (!anim.get().active) return;
    e.preventDefault();
    const [sx, sy] = local(e);
    const speed = e.ctrlKey || e.metaKey ? 0.01 : 0.0018;
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 30 : 1) * speed), sx, sy);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    const s = anim.get();
    if (!s.active) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // deux doigts : zoom et déplacement de la vue, le geste en cours s'arrête
    if (pointers.size === 2) {
      drag = null;
      clearTimeout(holdTimer);
      container.classList.remove('is-moving');
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
      return;
    }
    if (pointers.size > 2) return;

    // déplacer la vue : outil main, barre d'espace, clic du milieu, ou pendant la lecture
    if (s.pan || spaceDown || e.button === 1 || s.playing) {
      drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY } };
      return;
    }
    if (e.button !== 0) return;
    const p = pixelAt(e);
    const m = marginFor(s.rig);

    if (s.step === 'cut') {
      const sp = { x: p.x - m, y: p.y - m };
      if (s.tool === 'pivot') { placePivot(s.selected, sp.x, sp.y); return; }
      commit();
      const id = s.tool === 'paint' ? s.selected : BODY;
      paintAt(sp.x, sp.y, id);
      drag = { kind: 'paint', last: sp, id };
    } else if (s.step === 'pose') {
      const { owner, image } = current();
      const inside = p.x >= 0 && p.y >= 0 && p.x < image.width && p.y < image.height;
      const hit = inside ? owner[p.y * image.width + p.x] : -1;
      if (hit < 0 || hit === BODY) {
        // le corps ou le vide : on déplace la vue, jamais le personnage
        if (hit === BODY) anim.set({ selected: BODY });
        drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY } };
        return;
      }
      anim.set({ selected: hit });
      commit();
      const frame = s.frames[s.current];
      const pose = frame.pose[hit] || { angle: 0, dx: 0, dy: 0 };
      const world = worldTransforms(s.rig, frame.pose, { x: m, y: m });
      const part = s.rig.parts.find((q) => q.id === hit);
      const pivot = apply(world.get(hit).m, part.pivot);
      drag = {
        kind: 'rotate', id: hit, pivot, a0: Math.atan2(p.fy - pivot.y, p.fx - pivot.x), angle: pose.angle || 0,
        start: { x: e.clientX, y: e.clientY }, pose0: { angle: pose.angle || 0, dx: pose.dx || 0, dy: pose.dy || 0 },
        parentAngle: world.get(hit).angle - (pose.angle || 0), from: { x: p.fx, y: p.fy },
      };
      // maintien long sans bouger : le membre se déplace en X / Y (relâcher revient à la rotation)
      const d = drag;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        if (drag !== d || d.kind !== 'rotate') return;
        setPose(d.id, { angle: d.pose0.angle });
        d.kind = 'move';
        container.classList.add('is-moving');
        navigator.vibrate?.(20);
      }, HOLD_MS);
    } else if (s.step === 'touch') {
      const { image } = current();
      if (p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height) return;
      if (s.tool === 'picker') {
        const i = (p.y * image.width + p.x) * 4;
        if (image.data[i + 3]) anim.set({ color: [image.data[i], image.data[i + 1], image.data[i + 2]], tool: 'pencil' });
        return;
      }
      commit();
      touchAt(p, image);
      drag = { kind: 'touch', last: p, image };
    }
  });

  function touchAt(p, image) {
    const s = anim.get();
    if (p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height) return;
    const rgba = s.tool === 'eraser' ? [0, 0, 0, 0] : s.color ? [...s.color, 255] : null;
    if (rgba) setEdit(p.y * image.width + p.x, rgba);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const r = canvas.getBoundingClientRect();
      panBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
      if (pinch.dist > 0 && dist > 0) zoomAt(dist / pinch.dist, mid[0] - r.left, mid[1] - r.top);
      pinch = { dist, mid };
      return;
    }
    if (!drag) return;
    const s = anim.get();
    const m = marginFor(s.rig);
    if (drag.kind === 'pan') {
      panBy(e.clientX - drag.last.x, e.clientY - drag.last.y);
      drag.last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (drag.kind === 'rotate' && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > HOLD_SLOP) {
      clearTimeout(holdTimer);   // le doigt a bougé avant la fin du maintien : c'est une rotation
    }
    const p = pixelAt(e);
    if (drag.kind === 'move') {
      const c = Math.cos((drag.parentAngle * Math.PI) / 180), sn = Math.sin((drag.parentAngle * Math.PI) / 180);
      const wx = p.fx - drag.from.x, wy = p.fy - drag.from.y;
      setPose(drag.id, {
        dx: Math.round(drag.pose0.dx + c * wx + sn * wy),
        dy: Math.round(drag.pose0.dy - sn * wx + c * wy),
      });
      return;
    }
    if (drag.kind === 'paint') {
      const sp = { x: p.x - m, y: p.y - m };
      line(drag.last, sp, (x, y) => paintAt(x, y, drag.id));
      drag.last = sp;
    } else if (drag.kind === 'rotate') {
      if (!drag.rotating && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) <= HOLD_SLOP) return;
      drag.rotating = true;
      const a = Math.atan2(p.fy - drag.pivot.y, p.fx - drag.pivot.x);
      const angle = Math.round(drag.angle + ((a - drag.a0) * 180) / Math.PI);
      setPose(drag.id, { angle: ((angle + 540) % 360) - 180 });
    } else if (drag.kind === 'touch') {
      line(drag.last, p, (x, y) => touchAt({ x, y }, drag.image));
      drag.last = p;
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      drag = null;
      clearTimeout(holdTimer);
      container.classList.remove('is-moving');
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // barre d'espace maintenue : déplacer la vue, comme dans les logiciels de dessin
  const panCursor = () => container.classList.toggle('is-panning', anim.get().pan || spaceDown);
  // (même si un bouton de la barre a le focus : l'espace ne doit pas le réactiver)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !anim.get().active || e.target.closest?.('input, textarea, select')) return;
    e.preventDefault();
    if (!spaceDown) { spaceDown = true; panCursor(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !spaceDown) return;
    e.preventDefault();
    spaceDown = false;
    panCursor();
  });

  /* ------------------------------------------------------------- lecture */

  function syncPlayback() {
    const s = anim.get();
    clearInterval(timer);
    if (s.playing) {
      playIndex = s.current;
      timer = setInterval(() => {
        playIndex = (playIndex + 1) % anim.get().frames.length;
        draw();
        container.dispatchEvent(new CustomEvent('anim-play', { bubbles: true, detail: playIndex }));
      }, 1000 / Math.max(1, s.fps));
    }
    draw();
  }

  let frame = 0;
  const redraw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
  watch(anim, ['active'], (s) => { if (s.active) { fittedFor = ''; requestAnimationFrame(resize); } });
  watch(anim, ['base', 'version', 'frames', 'current', 'selected', 'step', 'tool', 'onion'], redraw);
  watch(anim, ['pan'], panCursor);
  watch(anim, ['playing', 'fps'], syncPlayback);
  new ResizeObserver(resize).observe(container);

  const zoomCenter = (f) => zoomAt(f, W / 2, H / 2);
  return { zoomIn: () => zoomCenter(1.5), zoomOut: () => zoomCenter(1 / 1.5), fit };
}
