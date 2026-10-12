// Point d'entrée : relie l'état, le worker et les modules d'interface.

import { crop } from '../core/image.js';
import { EMPTY_RULES } from '../core/palette.js';
import { withTargetGrid } from './controls.js';
import { store, watch, DEFAULT_SETTINGS } from './state.js';
import { setupImporter } from './importer.js';
import { createViewer } from './viewer.js';
import { createControls } from './controls.js';
import { createPaletteView } from './paletteView.js';
import { createEditor } from './editor.js';
import { createCropper } from './cropper.js';
import { createInspector } from './inspector.js';
import { createMiniPreview } from './miniPreview.js';
import { createExporter } from './exporter.js';
import { setupTooltips } from './tooltips.js';
import { setupAnimation } from './anim/animMode.js';

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------ worker --- */

const worker = new Worker(new URL('../worker/depix.worker.js', import.meta.url), { type: 'module' });
let lastId = 0;
const pending = new Map();

function ask(message, transfer = []) {
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
}

worker.onmessage = ({ data }) => {
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  if (data.type === 'error') p.reject(new Error(data.message));
  else p.resolve(data);
};
worker.onerror = (e) => store.set({ error: `Erreur du traitement : ${e.message || 'inconnue'}`, busy: false });

/* ------------------------------------------------- import & analyse --- */

/** Fait de `image` l'image de travail : analyse (grille + fond), puis conversion. */
async function work(image, bitmap) {
  store.set((s) => ({
    source: image, sourceBitmap: bitmap,
    detected: null, result: null, cropSel: null, error: '', busy: true,
    paletteSel: null, paletteReplacing: false,
    settings: { ...s.settings, paletteRules: EMPTY_RULES },
  }));
  try {
    // copie : l'image reste côté interface pour l'affichage
    const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    const { grid, background } = await ask({ type: 'analyze', image: copy }, [copy.data.buffer]);
    if (store.get().source !== image) return; // une autre image a pris la place entre-temps
    store.set((s) => ({
      detected: { grid, background },
      // grille détectée, ou calculée depuis la taille voulue si on est en mode « taille choisie »
      settings: withTargetGrid({ ...s.settings, period: grid.period, offsetX: grid.offsetX, offsetY: grid.offsetY }, image),
    }));
  } catch (err) {
    store.set({ error: err.message, busy: false });
  }
}

function onImage({ image, bitmap, name }) {
  store.set({ original: { image, bitmap }, sourceName: name, tool: 'none' });
  work(image, bitmap);
}

setupImporter({
  dropTarget: document.body,
  fileInput: $('#file'),
  onImage,
  onError: (message) => store.set({ error: message }),
});

$('#pick-another').addEventListener('click', () => $('#file').click());

/* ----------------------------------------------------------- rognage --- */

function applyCrop({ x, y, w, h }) {
  const { source } = store.get();
  const cropped = crop(source, x, y, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cropped.data), w, h), 0, 0);
  store.set({ tool: 'none' });
  work(cropped, canvas);
}

function restoreOriginal() {
  const { original } = store.get();
  if (original) work(original.image, original.bitmap);
}

/* -------------------------------------------------------- conversion --- */

const NO_BACKGROUND = { r: 0, g: 0, b: 0, transparent: true }; // aucun pixel opaque n'est du fond

let timer = 0;
let latest = 0;

function scheduleConvert() {
  clearTimeout(timer);
  timer = setTimeout(convertNow, 120);
}

async function convertNow() {
  const { source, detected, settings } = store.get();
  if (!source || !detected) return;
  const ticket = ++latest;
  store.set({ busy: true, error: '' });
  try {
    const { result } = await ask({
      type: 'convert',
      options: {
        grid: { period: settings.period, offsetX: settings.offsetX, offsetY: settings.offsetY },
        // photo : on ne retire le fond que si on le demande ; faux pixel art : toujours
        background: settings.gridMode === 'target' && !settings.removeBg ? NO_BACKGROUND : detected.background,
        tolerance: settings.tolerance,
        colors: Math.round(settings.colors),
        paletteRules: settings.paletteRules,
        cleanup: settings.cleanup ? { isolated: true, minIsland: Math.round(settings.minIsland), fillHoles: true } : null,
      },
    });
    if (ticket !== latest) return; // un réglage plus récent est déjà en route
    store.set({ result, busy: false });
  } catch (err) {
    if (ticket === latest) store.set({ error: err.message, busy: false });
  }
}

watch(store, ['detected'], scheduleConvert);
watch(store, ['settings'], (s, prev) => {
  // le fond de sortie et la toile d'export ne changent rien à la conversion
  const keys = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'output' && k !== 'canvasSize');
  if (keys.some((k) => s.settings[k] !== prev.settings[k])) scheduleConvert();
});

/* ------------------------------------------------------- modules UI --- */

const editor = createEditor(store);
const cropper = createCropper(store, {
  applyBtn: $('#crop-apply'),
  cancelBtn: $('#crop-cancel'),
  resetBtn: $('#crop-reset'),
  actions: $('#crop-actions'),
  onApply: applyCrop,
  onReset: restoreOriginal,
});
const inspector = createInspector($('#pixel-info'), store, editor);
const viewer = createViewer(
  { original: $('#view-original'), result: $('#view-result') },
  store,
  { onEditPointer: editor.onEditPointer, onCropPointer: cropper.onCropPointer, onInspect: inspector.select },
);
createMiniPreview($('#mini-preview'), store, $('.pane-result'), $('#stage'));
createControls($('#controls'), store);
createPaletteView($('#palette'), $('#swatch-detail'), store);
createExporter($('#export'), store);
setupTooltips();
setupAnimation(store);

/* ---------------------------------------------------------- barre d'outils --- */

// un second clic sur l'outil actif le désactive (retour au défilement normal)
for (const btn of document.querySelectorAll('button[data-tool]')) {
  btn.addEventListener('click', () =>
    store.set((s) => ({ tool: s.tool === btn.dataset.tool ? 'none' : btn.dataset.tool })));
}

// sections de réglages : repliées sur téléphone, ouvertes sur ordinateur
const sections = document.querySelectorAll('details.section');
const narrow = window.matchMedia('(max-width: 999px)');
const applyLayout = () => sections.forEach((d) => { d.open = !narrow.matches; });
applyLayout();
narrow.addEventListener('change', applyLayout);
$('#undo').addEventListener('click', editor.undo);
$('#redo').addEventListener('click', editor.redo);
$('#zoom-in').addEventListener('click', viewer.zoomIn);
$('#zoom-out').addEventListener('click', viewer.zoomOut);
$('#zoom-fit').addEventListener('click', viewer.fit);
$('#zoom-all').addEventListener('click', viewer.fitAll);
$('#show-grid').addEventListener('change', (e) =>
  store.set((s) => ({ view: { ...s.view, grid: e.target.checked } })));
for (const btn of document.querySelectorAll('button[data-mode]')) {
  btn.addEventListener('click', () => store.set((s) => ({ view: { ...s.view, mode: btn.dataset.mode } })));
}

// on ne rogne que sur l'original : on l'affiche si besoin
watch(store, ['tool'], (s) => {
  if (s.tool === 'crop' && s.view.mode === 'result') store.set({ view: { ...s.view, mode: 'side' } });
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
  if (document.body.classList.contains('is-anim')) return;
  const s = store.get();
  const tools = { m: 'move', h: 'move', b: 'pencil', p: 'pencil', e: 'eraser', i: 'picker', c: 'crop' };
  const tool = tools[e.key.toLowerCase()];
  if (tool && (tool === 'crop' ? s.source : s.result)) store.set({ tool });
  if (e.key === '+') viewer.zoomIn();
  if (e.key === '-') viewer.zoomOut();
  if (e.key === '0') viewer.fit();
});

/* ------------------------------------------------------------- rendu --- */

function render() {
  const s = store.get();
  document.body.classList.toggle('has-image', Boolean(s.source));
  document.body.classList.toggle('has-result', Boolean(s.result));
  $('#stage').dataset.mode = s.view.mode;
  $('#stage').dataset.tool = s.tool;
  for (const btn of document.querySelectorAll('button[data-tool]')) btn.setAttribute('aria-pressed', String(btn.dataset.tool === s.tool));
  for (const btn of document.querySelectorAll('button[data-mode]')) btn.setAttribute('aria-pressed', String(btn.dataset.mode === s.view.mode));
  $('#undo').disabled = !s.history.undo;
  $('#redo').disabled = !s.history.redo;
  $('#show-grid').checked = s.view.grid;
  $('#current-color').style.background = s.color ? `rgb(${s.color.join(',')})` : 'transparent';

  const hint = $('#hint');
  hint.textContent = s.tool === 'crop' && s.cropSel
    ? `Sélection : ${s.cropSel.w} × ${s.cropSel.h} px — « Rogner ici » pour valider.`
    : '';

  const status = $('#status');
  status.classList.toggle('is-error', Boolean(s.error));
  if (s.error) status.textContent = s.error;
  else if (s.busy) status.textContent = 'Conversion…';
  else if (s.result) {
    const { width, height, filled, colors } = s.result.stats;
    status.textContent = `${width} × ${height} px · ${colors} couleurs · ${filled} pixels pleins`;
  } else status.textContent = s.source ? '' : 'Aucune image';

  const cropped = s.original && s.source !== s.original.image;
  $('#source-name').textContent = s.source
    ? `${s.sourceName} — ${s.source.width} × ${s.source.height} px${cropped ? ' (rogné)' : ''}`
    : '';
}

store.subscribe(render);
render();
