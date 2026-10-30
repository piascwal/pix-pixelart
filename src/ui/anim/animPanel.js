// Panneau et barres du mode Animation : étapes et outils, pièces (nom,
// rattachement, ordre devant / derrière), pose de la pièce choisie, palette de
// retouche, images (vignettes, lecture, ajout, suppression), export.

import { BODY, spriteSheet, commonBounds } from '../../core/rig.js';
import { gameSheet } from '../../core/project.js';
import { jointLabel } from '../../core/skeleton.js';
import { ACTIONS, ACTION_INFO, VARIANTES } from '../../core/actions.js';
import { usedColors } from '../../core/palette.js';
import { toHex } from '../../core/image.js';
import { upscale, flatten } from '../../core/upscale.js';
import { encodeGif } from '../../core/gif.js';
import { crop } from '../../core/image.js';
import { watch } from '../state.js';
import { toPngBlob, download } from '../exporter.js';
import { icon } from '../icons.js';
import { toast } from '../clipboard.js';
import {
  anim, commit, undoLast, redoLast, addPart, removePart, updatePart, movePart, setPose,
  addFrame, removeFrame, clearEdits, frameImage, partColor, interpolateFrames, generateAction, switchClip, allClips, saveProject, variantPreviews, completeCut, completePose, addHumanSkeleton, autoSkin, cleanIslands,
} from './animStore.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
function iconButton(name, label, onClick) {
  const b = el('button', 'icon-btn');
  b.type = 'button';
  b.append(icon(name));
  b.setAttribute('aria-label', label);
  b.dataset.tip = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export function createAnimPanel(root, mainStore) {
  /* ---------------------------------------------------- étapes et outils */
  for (const b of root.querySelectorAll('[data-anim-step]')) {
    b.addEventListener('click', () => {
      const step = b.dataset.animStep;
      anim.set({ step, tool: step === 'cut' ? 'paint' : step === 'touch' ? 'pencil' : anim.get().tool, playing: false });
    });
  }
  for (const b of root.querySelectorAll('[data-anim-tool]')) b.addEventListener('click', () => anim.set({ tool: b.dataset.animTool }));
  for (const b of root.querySelectorAll('[data-anim-brush]')) b.addEventListener('click', () => anim.set({ brush: Number(b.dataset.animBrush) }));
  $('#anim-undo', root).addEventListener('click', undoLast);
  $('#anim-redo', root).addEventListener('click', redoLast);
  $('#anim-pan', root).addEventListener('click', () => anim.set((s) => ({ pan: !s.pan })));

  /* -------------------------------------------------------------- pièces */
  const list = $('#anim-part-list', root);
  $('#anim-add-part', root).addEventListener('click', addPart);

  function renderParts() {
    const { rig, selected } = anim.get();
    if (!rig) return;
    list.replaceChildren();
    // de l'avant vers le fond, comme les calques d'un logiciel de dessin
    for (const id of [...rig.order].reverse()) {
      const p = rig.parts.find((q) => q.id === id);
      const li = el('li', 'part-row' + (id === selected ? ' is-selected' : ''));
      li.addEventListener('click', () => anim.set({ selected: id }));
      const chip = el('span', 'part-chip');
      chip.style.background = partColor(id);
      if (id !== BODY) chip.dataset.tip = `Son point : ${jointLabel(p.name).toLowerCase()}`;
      li.append(chip);
      if (id === BODY) {
        li.dataset.tip = 'Zone par défaut : tout ce qui n\u2019est pas attribué à une pièce. On ne la peint pas.';
        li.append(el('span', 'part-name', p.name));
      } else {
        const name = el('input', 'part-name');
        name.value = p.name;
        name.setAttribute('aria-label', 'Nom de la pièce');
        name.addEventListener('change', () => updatePart(id, { name: name.value.trim() || p.name }));
        name.addEventListener('click', (e) => e.stopPropagation());
        const parent = el('select', 'part-parent');
        parent.setAttribute('aria-label', 'Rattachée à');
        parent.title = 'Rattachée à';
        for (const q of rig.parts) {
          if (q.id === id) continue;
          const o = el('option', null, q.name);
          o.value = String(q.id);
          o.selected = q.id === p.parent;
          parent.append(o);
        }
        parent.addEventListener('click', (e) => e.stopPropagation());
        parent.addEventListener('change', () => updatePart(id, { parent: Number(parent.value) }));
        li.append(name, parent);
      }
      const tools = el('span', 'part-tools');
      tools.append(
        iconButton('chevron-up', 'Mettre devant', () => movePart(id, +1)),
        iconButton('chevron-down', 'Mettre derrière', () => movePart(id, -1)),
      );
      if (id !== BODY) tools.append(iconButton('trash-2', 'Supprimer la pièce', () => removePart(id)));
      li.append(tools);
      list.append(li);
    }
  }

  /* ---------------------------------------------------------------- pose */
  const angleInputs = [$('#anim-angle', root), $('#anim-angle-range', root)];
  const dxInput = $('#anim-dx', root), dyInput = $('#anim-dy', root);
  const poseInfo = $('[data-info="anim-part"]', root);
  let poseCommitted = false;   // un seul point d'annulation par réglage continu
  const startEdit = () => { if (!poseCommitted) { commit(); poseCommitted = true; } };
  const endEdit = () => { poseCommitted = false; };
  for (const input of angleInputs) {
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      startEdit();
      setPose(anim.get().selected, { angle: Math.max(-180, Math.min(180, Math.round(v))) });
    });
    input.addEventListener('change', endEdit);
  }
  for (const [input, key] of [[dxInput, 'dx'], [dyInput, 'dy']]) {
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      startEdit();
      setPose(anim.get().selected, { [key]: Math.round(v) });
    });
    input.addEventListener('change', endEdit);
  }
  $('#anim-reset-pose', root).addEventListener('click', () => {
    commit();
    setPose(anim.get().selected, { angle: 0, dx: 0, dy: 0 });
  });

  function renderPose() {
    const s = anim.get();
    if (!s.rig) return;
    const part = s.rig.parts.find((p) => p.id === s.selected) || s.rig.parts[0];
    const pose = s.frames[s.current]?.pose[part.id] || { angle: 0, dx: 0, dy: 0 };
    poseInfo.textContent = part.name;
    for (const input of angleInputs) if (document.activeElement !== input) input.value = String(pose.angle || 0);
    if (document.activeElement !== dxInput) dxInput.value = String(pose.dx || 0);
    if (document.activeElement !== dyInput) dyInput.value = String(pose.dy || 0);
  }

  /* ------------------------------------------------------------ retouche */
  const swatches = $('#anim-swatches', root);
  $('#anim-clear-edits', root).addEventListener('click', clearEdits);
  function renderSwatches() {
    const { base, color } = anim.get();
    if (!base) return;
    swatches.replaceChildren();
    const colors = usedColors(base);
    if (!color && colors.length) anim.set({ color: colors[colors.length - 1] });
    for (const c of colors) {
      const hex = toHex(c);
      const b = el('button', 'swatch' + (color && toHex(color) === hex ? ' is-selected' : ''));
      b.type = 'button';
      b.style.background = hex;
      b.title = hex;
      b.setAttribute('aria-label', `Couleur ${hex}`);
      b.addEventListener('click', () => anim.set({ color: c, tool: 'pencil' }));
      swatches.append(b);
    }
  }

  /* -------------------------------------------------------------- images */
  const strip = $('#anim-strip', root);
  $('#anim-add-frame', root).addEventListener('click', addFrame);
  $('#anim-del-frame', root).addEventListener('click', removeFrame);
  const betweenN = $('#anim-between-n', root);
  betweenN.addEventListener('input', () => {
    const v = Math.round(Number(betweenN.value));
    if (v >= 1 && v <= 12) anim.set({ between: v });
  });
  $('#anim-between', root).addEventListener('click', () => {
    if (!interpolateFrames(anim.get().between)) toast('Il faut au moins deux images.');
  });
  $('#anim-onion', root).addEventListener('click', () => anim.set((s) => ({ onion: !s.onion })));
  for (const b of root.querySelectorAll('[data-walk]')) b.addEventListener('click', () => anim.set({ walkStyle: b.dataset.walk }));
  for (const b of root.querySelectorAll('[data-clip]')) b.addEventListener('click', () => switchClip(b.dataset.clip));

  /* ------------------------------------------- galerie des variantes */
  // chaque variante jouée en boucle sur le personnage découpé ; un toucher la génère
  const gallery = $('#anim-gallery', root);
  let shown = [], tick = 0, timer = 0;
  const toCanvas = (img, c) => {
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  };
  function renderGallery() {
    const s = anim.get();
    const visible = s.active && s.step === 'pose';
    clearInterval(timer);
    if (!visible) { gallery.replaceChildren(); shown = []; return; }
    const list = variantPreviews();
    const chosen = s.variantes[s.clip] || VARIANTES[s.clip]?.[0].key;
    gallery.replaceChildren();
    shown = list.map((v) => {
      const b = el('button', 'galerie-item');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v.key === chosen));
      const c = el('canvas');
      b.append(c, el('span', '', v.label));
      b.addEventListener('click', () => {
        if (!generateAction(anim.get().walkStyle, anim.get().clip, v.key)) toast('Aucun bras ni jambe reconnu.');
      });
      gallery.append(b);
      return { canvas: c, images: v.images };
    });
    if (!list.length) gallery.append(el('p', 'hint', 'Découpez d’abord bras et jambes (Squelette, puis Découpe auto) pour voir les variantes.'));
    const step = () => { tick++; for (const v of shown) toCanvas(v.images[tick % v.images.length], v.canvas); };
    step();
    timer = setInterval(step, 1000 / Math.max(1, ACTION_INFO[s.clip]?.fps ?? 8));
  }
  watch(anim, ['active', 'step', 'version', 'clip', 'walkStyle', 'polish', 'variantes'], renderGallery);
  const polish = $('#anim-polish', root);
  polish.addEventListener('change', () => anim.set({ polish: polish.checked }));
  $('#anim-save-project', root).addEventListener('click', () => {
    download(new Blob([saveProject()], { type: 'application/json' }), `${baseName()}-projet.json`);
  });
  $('#anim-walk', root).addEventListener('click', () => {
    if (!generateAction(anim.get().walkStyle)) toast('Aucun bras ni jambe reconnu : vérifiez que chaque membre est une pièce avec son pivot (hors tête).');
  });
  $('#anim-complete', root).addEventListener('click', () => {
    if (!completeCut()) toast('Rien à ajouter : les pièces touchent déjà tous leurs pixels reliés (ou aucun pivot n\u2019est placé).');
  });
  $('#anim-skeleton', root).addEventListener('click', () => {
    const n = addHumanSkeleton();
    toast(n ? 'Squelette posé : glissez chaque point sur son articulation' : 'Squelette déjà présent : articulations replacées si besoin');
  });
  $('#anim-skin', root).addEventListener('click', () => {
    const n = autoSkin();
    toast(n ? `${n} pixel${n > 1 ? 's' : ''} attribué${n > 1 ? 's' : ''} aux pièces` : 'Rien à attribuer : placez d\u2019abord les articulations (Squelette).');
  });
  for (const b of root.querySelectorAll('[data-islands]')) {
    b.addEventListener('click', () => {
      const n = cleanIslands({ all: b.dataset.islands === 'all' });
      toast(n ? `${n} pixel${n > 1 ? 's' : ''} isolé${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}` : 'Aucun îlot à supprimer.');
    });
  }
  $('#anim-fill', root).addEventListener('click', () => {
    const n = completePose();
    toast(n ? `${n} pixel${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : 'Aucun vide à combler sur cette image.');
  });
  $('#anim-play', root).addEventListener('click', () => anim.set((s) => ({ playing: !s.playing })));
  const fps = $('#anim-fps', root);
  fps.addEventListener('input', () => {
    const v = Math.round(Number(fps.value));
    if (v >= 1 && v <= 30) anim.set({ fps: v });
  });

  function renderStrip(playIndex = null) {
    const s = anim.get();
    if (!s.rig) return;
    strip.replaceChildren();
    s.frames.forEach((f, i) => {
      const { image } = frameImage(f);
      const c = el('canvas', 'thumb' + ((playIndex ?? s.current) === i ? ' is-current' : ''));
      c.width = image.width;
      c.height = image.height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
      c.title = `Image ${i + 1}`;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `Image ${i + 1}`);
      c.addEventListener('click', () => anim.set({ current: i, playing: false }));
      strip.append(c);
    });
  }
  root.addEventListener('anim-play', (e) => {
    strip.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('is-current', i === e.detail));
  });

  /* -------------------------------------------------------------- export */
  const baseName = () => (mainStore.get().sourceName || 'sprite').replace(/\.[a-z0-9]+$/i, '').replace(/-projet$/, '');
  for (const b of root.querySelectorAll('[data-anim-export]')) {
    b.addEventListener('click', async () => {
      const s = anim.get();
      if (b.dataset.animExport === 'jeu') {
        // une ligne par animation travaillée, dans l'ordre de ACTIONS (puis les autres)
        const clips = allClips();
        const names = [...ACTIONS.filter((n) => clips[n]), ...Object.keys(clips).filter((n) => !ACTIONS.includes(n))];
        const rows = names
          .filter((n) => clips[n].some((f) => Object.keys(f.pose).length || f.edits.size) || n === s.clip)
          .map((n) => ({ name: n, images: clips[n].map((f) => frameImage(f).image), fps: n === s.clip ? s.fps : ACTION_INFO[n]?.fps ?? s.fps }));
        const { image, meta } = gameSheet(rows);
        const out = mainStore.get().settings.output === 'magenta' ? flatten(image) : image;
        download(await toPngBlob(out), `${baseName()}-jeu.png`);
        download(new Blob([JSON.stringify({ ...meta, regard: s.walkStyle }, null, 2)], { type: 'application/json' }), `${baseName()}-jeu.json`);
        return;
      }
      const sheet = spriteSheet(s.frames.map((f) => frameImage(f).image));
      const name = baseName() + '-animation';
      if (b.dataset.animExport === 'json') {
        const meta = {
          frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight, frames: sheet.count, fps: s.fps,
          durations: s.frames.map(() => Math.round(1000 / s.fps)),
        };
        download(new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }), `${name}.json`);
        return;
      }
      if (b.dataset.animExport.startsWith('gif')) {
        // toutes les images recadrées sur la même boîte, agrandies, puis encodées en GIF animé
        const frames = s.frames.map((f) => frameImage(f).image);
        const box = commonBounds(frames);
        const scale = Number(b.dataset.animExport.slice(3));
        const magenta = mainStore.get().settings.output === 'magenta';
        const images = frames.map((f) => {
          const big = upscale(crop(f, box.x, box.y, box.w, box.h), scale);
          return magenta ? flatten(big) : big;
        });
        download(new Blob([encodeGif(images, { delayMs: Math.round(1000 / s.fps) })], { type: 'image/gif' }), `${name}${scale > 1 ? '-x' + scale : ''}.gif`);
        return;
      }
      const factor = Number(b.dataset.animExport);
      let img = upscale(sheet.image, factor);
      if (mainStore.get().settings.output === 'magenta') img = flatten(img);
      download(await toPngBlob(img), `${name}${factor > 1 ? '-x' + factor : ''}.png`);
    });
  }

  /* --------------------------------------------------------------- rendu */
  function renderBars() {
    const s = anim.get();
    for (const b of root.querySelectorAll('[data-anim-step]')) b.setAttribute('aria-pressed', String(b.dataset.animStep === s.step));
    for (const g of root.querySelectorAll('[data-anim-tools]')) g.hidden = g.dataset.animTools !== s.step;
    for (const b of root.querySelectorAll('[data-anim-tool]')) b.setAttribute('aria-pressed', String(b.dataset.animTool === s.tool));
    for (const b of root.querySelectorAll('[data-anim-brush]')) b.setAttribute('aria-pressed', String(Number(b.dataset.animBrush) === s.brush));
    for (const c of root.querySelectorAll('[data-anim-card]')) c.hidden = !c.dataset.animCard.split(' ').includes(s.step);
    $('#anim-pan', root).setAttribute('aria-pressed', String(s.pan));
    $('#anim-onion', root).setAttribute('aria-pressed', String(s.onion));
    $('#anim-between', root).disabled = s.frames.length < 2;
    for (const b of root.querySelectorAll('[data-walk]')) b.setAttribute('aria-pressed', String(b.dataset.walk === s.walkStyle));
    for (const b of root.querySelectorAll('[data-clip]')) b.setAttribute('aria-pressed', String(b.dataset.clip === s.clip));
    $('#anim-walk-label', root).textContent = `Générer : ${(ACTION_INFO[s.clip]?.label ?? s.clip).toLowerCase()}`;
    polish.checked = s.polish;
    if (document.activeElement !== betweenN) betweenN.value = String(s.between);
    $('#anim-undo', root).disabled = !s.history.undo;
    $('#anim-redo', root).disabled = !s.history.redo;
    $('#anim-del-frame', root).disabled = s.frames.length <= 1;
    const play = $('#anim-play', root);
    play.replaceChildren(icon(s.playing ? 'pause' : 'play'));
    play.setAttribute('aria-pressed', String(s.playing));
    $('#anim-color', root).style.background = s.color ? toHex(s.color) : 'transparent';
    if (document.activeElement !== fps) fps.value = String(s.fps);
    $('#anim-count', root).textContent = `${s.current + 1} / ${s.frames.length}`;
  }

  watch(anim, ['rig', 'version', 'selected'], renderParts);
  watch(anim, ['frames', 'current', 'selected', 'version'], renderPose);
  watch(anim, ['base', 'color'], renderSwatches);
  watch(anim, ['frames', 'current', 'version', 'base', 'polish'], () => renderStrip());
  watch(anim, ['step', 'tool', 'brush', 'history', 'frames', 'current', 'playing', 'color', 'fps', 'pan', 'onion', 'walkStyle', 'between', 'clip', 'polish'], renderBars);
  watch(anim, ['active'], (s) => { if (s.active) { renderParts(); renderPose(); renderSwatches(); renderStrip(); renderBars(); } });
}
