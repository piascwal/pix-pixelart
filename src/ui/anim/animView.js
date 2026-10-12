// Canevas du mode Animation.
//   Découper : le sprite, chaque pièce teintée de sa couleur, pivots et squelette ;
//              pinceau (attribuer à la pièce choisie), gomme (rendre au corps), pivot.
//   Poser    : l'image composée ; on attrape une pièce et on la fait tourner autour
//              de son pivot (le corps, lui, se déplace).
//   Retoucher: crayon, gomme, pipette sur l'image courante.

import { worldTransforms, apply, marginFor, BODY } from '../../core/rig.js';
import { watch } from '../state.js';
import {
  anim, commit, paintAt, placePivot, setPose, setEdit, frameImage, partColor,
} from './animStore.js';

export function createAnimView(canvas, container) {
  const ctx = canvas.getContext('2d');
  const sprite = document.createElement('canvas');
  let scale = 1;
  let playIndex = 0;
  let timer = 0;

  /** Image affichée et ses dimensions (marge comprise, pour que tout reste aligné). */
  function current() {
    const s = anim.get();
    const frame = s.frames[s.playing ? playIndex : s.current];
    return frameImage(frame);
  }

  function fitScale(w, h) {
    const s = anim.get();
    if (s.zoom) return s.zoom;
    const cw = container.clientWidth - 16, ch = container.clientHeight - 16;
    return Math.max(1, Math.floor(Math.min(cw / w, ch / h)));
  }

  function draw() {
    const s = anim.get();
    if (!s.active || !s.base) return;
    const { image, margin: m } = current();
    scale = fitScale(image.width, image.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${image.width * scale}px`;
    canvas.style.height = `${image.height * scale}px`;
    canvas.width = Math.round(image.width * scale * dpr);
    canvas.height = Math.round(image.height * scale * dpr);
    const k = scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    if (s.step === 'cut' && !s.playing) {
      // le sprite au repos, pièces teintées
      sprite.width = s.base.width; sprite.height = s.base.height;
      sprite.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.base.data), s.base.width, s.base.height), 0, 0);
      ctx.drawImage(sprite, m * k, m * k, s.base.width * k, s.base.height * k);
      const { rig } = s;
      for (let i = 0; i < rig.labels.length; i++) {
        const id = rig.labels[i];
        if (id === BODY || !s.base.data[i * 4 + 3]) continue;
        const x = i % rig.width, y = (i - x) / rig.width;
        ctx.globalAlpha = id === s.selected ? 0.6 : 0.35;
        ctx.fillStyle = partColor(id);
        ctx.fillRect((x + m) * k, (y + m) * k, k, k);
      }
      ctx.globalAlpha = 1;
      drawSkeleton(rig, (p) => ({ x: p.pivot.x + m, y: p.pivot.y + m }), k);
    } else {
      sprite.width = image.width; sprite.height = image.height;
      sprite.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
      ctx.drawImage(sprite, 0, 0, image.width * k, image.height * k);
      if (s.step === 'pose' && !s.playing) {
        const frame = s.frames[s.current];
        const world = worldTransforms(s.rig, frame.pose, { x: m, y: m });
        drawSkeleton(s.rig, (p) => apply(world.get(p.id).m, p.pivot), k);
      }
    }
  }

  /** Pivots (cercles) reliés à celui du parent ; la pièce choisie est mise en avant. */
  function drawSkeleton(rig, at, k) {
    const s = anim.get();
    const pos = new Map(rig.parts.map((p) => [p.id, at(p)]));
    ctx.lineWidth = Math.max(1, k / 4);
    for (const p of rig.parts) {
      // pas de trait vers le corps : seuls les liens entre membres aident à lire le squelette
      if (p.id === BODY || p.parent === null || p.parent === undefined || p.parent === BODY) continue;
      const a = pos.get(p.id), b = pos.get(p.parent);
      if (!b) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke();
    }
    for (const p of rig.parts) {
      if (p.id === BODY) continue;
      const c = pos.get(p.id);
      const r = Math.max(4, k * 0.9) * (p.id === s.selected ? 1.4 : 1);
      ctx.beginPath();
      ctx.arc(c.x * k, c.y * k, r, 0, Math.PI * 2);
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

  const toPixel = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / scale), y: Math.floor((e.clientY - r.top) / scale), fx: (e.clientX - r.left) / scale, fy: (e.clientY - r.top) / scale };
  };

  let drag = null;

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

  canvas.addEventListener('pointerdown', (e) => {
    const s = anim.get();
    if (!s.active || s.playing || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = toPixel(e);
    const m = marginFor(s.rig);

    if (s.step === 'cut') {
      const sp = { x: p.x - m, y: p.y - m };
      if (s.tool === 'pivot') { placePivot(s.selected, sp.x, sp.y); return; }
      commit();
      const id = s.tool === 'paint' ? s.selected : BODY;
      paintAt(sp.x, sp.y, id);
      drag = { kind: 'paint', last: sp, id };
    } else if (s.step === 'pose') {
      const { owner } = current();
      const img = current().image;
      const hit = p.x >= 0 && p.y >= 0 && p.x < img.width && p.y < img.height ? owner[p.y * img.width + p.x] : -1;
      const id = hit >= 0 ? hit : s.selected;
      anim.set({ selected: id });
      commit();
      const frame = s.frames[s.current];
      const pose = frame.pose[id] || { angle: 0, dx: 0, dy: 0 };
      if (id === BODY) {
        drag = { kind: 'move', id, start: p, dx: pose.dx || 0, dy: pose.dy || 0 };
      } else {
        const world = worldTransforms(s.rig, frame.pose, { x: m, y: m });
        const part = s.rig.parts.find((q) => q.id === id);
        const pivot = apply(world.get(id).m, part.pivot);
        drag = { kind: 'rotate', id, pivot, a0: Math.atan2(p.fy - pivot.y, p.fx - pivot.x), angle: pose.angle || 0 };
      }
    } else if (s.step === 'touch') {
      const img = current().image;
      if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) return;
      if (s.tool === 'picker') {
        const i = (p.y * img.width + p.x) * 4;
        if (img.data[i + 3]) anim.set({ color: [img.data[i], img.data[i + 1], img.data[i + 2]], tool: 'pencil' });
        return;
      }
      commit();
      touchAt(p, img);
      drag = { kind: 'touch', last: p, img };
    }
  });

  function touchAt(p, img) {
    const s = anim.get();
    if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) return;
    const rgba = s.tool === 'eraser' ? [0, 0, 0, 0] : s.color ? [...s.color, 255] : null;
    if (rgba) setEdit(p.y * img.width + p.x, rgba);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toPixel(e);
    const s = anim.get();
    const m = marginFor(s.rig);
    if (drag.kind === 'paint') {
      const sp = { x: p.x - m, y: p.y - m };
      line(drag.last, sp, (x, y) => paintAt(x, y, drag.id));
      drag.last = sp;
    } else if (drag.kind === 'rotate') {
      const a = Math.atan2(p.fy - drag.pivot.y, p.fx - drag.pivot.x);
      const angle = Math.round(drag.angle + ((a - drag.a0) * 180) / Math.PI);
      setPose(drag.id, { angle: ((angle + 540) % 360) - 180 });
    } else if (drag.kind === 'move') {
      setPose(drag.id, { dx: drag.dx + (p.x - drag.start.x), dy: drag.dy + (p.y - drag.start.y) });
    } else if (drag.kind === 'touch') {
      line(drag.last, p, (x, y) => touchAt({ x, y }, drag.img));
      drag.last = p;
    }
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  /* ------------------------------------------------------------- lecture */

  function syncPlayback() {
    const s = anim.get();
    clearInterval(timer);
    if (s.playing) {
      playIndex = s.current;
      timer = setInterval(() => {
        const st = anim.get();
        playIndex = (playIndex + 1) % st.frames.length;
        draw();
        container.dispatchEvent(new CustomEvent('anim-play', { detail: playIndex }));
      }, 1000 / Math.max(1, s.fps));
    }
    draw();
  }

  let frame = 0;
  const redraw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
  watch(anim, ['active', 'base', 'version', 'frames', 'current', 'selected', 'step', 'tool', 'zoom'], redraw);
  watch(anim, ['playing', 'fps'], syncPlayback);
  new ResizeObserver(redraw).observe(container);
}
