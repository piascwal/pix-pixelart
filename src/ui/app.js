// Point d'entrée : relie l'état, le worker et les modules d'interface.

import { store, watch, DEFAULT_SETTINGS } from './state.js';
import { setupImporter } from './importer.js';
import { createViewer } from './viewer.js';
import { createControls } from './controls.js';
import { createPaletteView } from './paletteView.js';
import { createEditor } from './editor.js';
import { createExporter } from './exporter.js';

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

async function onImage({ image, bitmap, name }) {
  store.set({
    source: image, sourceBitmap: bitmap, sourceName: name,
    detected: null, result: null, error: '', busy: true,
  });
  try {
    // copie : l'original reste côté interface pour l'affichage
    const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    const { grid, background } = await ask({ type: 'analyze', image: copy }, [copy.data.buffer]);
    if (store.get().source !== image) return; // une autre image a été chargée entre-temps
    store.set((s) => ({
      detected: { grid, background },
      settings: { ...s.settings, period: grid.period, offsetX: grid.offsetX, offsetY: grid.offsetY },
    }));
  } catch (err) {
    store.set({ error: err.message, busy: false });
  }
}

const importer = setupImporter({
  dropTarget: document.body,
  fileInput: $('#file'),
  onImage,
  onError: (message) => store.set({ error: message }),
});

$('#example').addEventListener('click', () => importer.loadUrl('tests/fixtures/padel-ia.jpg', 'padel-ia.jpg'));

/* -------------------------------------------------------- conversion --- */

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
        background: detected.background,
        tolerance: settings.tolerance,
        colors: Math.round(settings.colors),
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
  // la couleur de fond de sortie ne change rien à la conversion
  const keys = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'output');
  if (keys.some((k) => s.settings[k] !== prev.settings[k])) scheduleConvert();
});

/* ------------------------------------------------------- modules UI --- */

const editor = createEditor(store);
const viewer = createViewer(
  { original: $('#view-original'), result: $('#view-result') },
  store,
  { onEditPointer: editor.onEditPointer },
);
createControls($('#controls'), store);
createPaletteView($('#palette'), store);
createExporter($('#export'), store);

/* ---------------------------------------------------------- barre d'outils --- */

for (const btn of document.querySelectorAll('[data-tool]')) {
  btn.addEventListener('click', () => store.set({ tool: btn.dataset.tool }));
}
$('#undo').addEventListener('click', editor.undo);
$('#redo').addEventListener('click', editor.redo);
$('#zoom-in').addEventListener('click', viewer.zoomIn);
$('#zoom-out').addEventListener('click', viewer.zoomOut);
$('#zoom-fit').addEventListener('click', viewer.fit);
$('#zoom-all').addEventListener('click', viewer.fitAll);
$('#show-grid').addEventListener('change', (e) =>
  store.set((s) => ({ view: { ...s.view, grid: e.target.checked } })));
for (const btn of document.querySelectorAll('[data-mode]')) {
  btn.addEventListener('click', () => store.set((s) => ({ view: { ...s.view, mode: btn.dataset.mode } })));
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
  const tools = { m: 'move', h: 'move', b: 'pencil', p: 'pencil', e: 'eraser', i: 'picker' };
  const tool = tools[e.key.toLowerCase()];
  if (tool && store.get().result) store.set({ tool });
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
  for (const btn of document.querySelectorAll('[data-tool]')) btn.setAttribute('aria-pressed', String(btn.dataset.tool === s.tool));
  for (const btn of document.querySelectorAll('[data-mode]')) btn.setAttribute('aria-pressed', String(btn.dataset.mode === s.view.mode));
  $('#undo').disabled = !s.history.undo;
  $('#redo').disabled = !s.history.redo;
  $('#show-grid').checked = s.view.grid;
  $('#current-color').style.background = s.color ? `rgb(${s.color.join(',')})` : 'transparent';

  const status = $('#status');
  status.classList.toggle('is-error', Boolean(s.error));
  if (s.error) status.textContent = s.error;
  else if (s.busy) status.textContent = 'Conversion…';
  else if (s.result) {
    const { width, height, filled, colors } = s.result.stats;
    status.textContent = `${width} × ${height} px · ${colors} couleurs · ${filled} pixels pleins`;
  } else status.textContent = s.source ? '' : 'Aucune image';
  $('#source-name').textContent = s.source ? `${s.sourceName} — ${s.source.width} × ${s.source.height} px` : '';
}

store.subscribe(render);
render();
