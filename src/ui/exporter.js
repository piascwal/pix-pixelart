// Export PNG : taille native ou agrandie ×2 / ×4 / ×8 au plus proche voisin,
// fond transparent ou magenta #ff00ff selon le réglage.

import { upscale, flatten, padToCanvas } from '../core/upscale.js';
import { usedColors } from '../core/palette.js';
import { toHex } from '../core/image.js';
import { watch } from './state.js';
import { copyText, toast } from './clipboard.js';

export function toPngBlob(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Couleurs réellement présentes dans l'image (retouches comprises), du plus sombre au plus clair. */
export function paletteHexes(img) {
  return usedColors(img).map(toHex);
}

/** Image à exporter : celle du résultat, posée sur une toile carrée si on en a choisi une qui la contient. */
export function exportBase(edited, canvasSize) {
  const fits = canvasSize > 0 && edited.width <= canvasSize && edited.height <= canvasSize;
  return fits ? padToCanvas(edited, canvasSize) : edited;
}

export function createExporter(root, store) {
  const buttons = root.querySelectorAll('[data-export]');
  const canvasSelect = root.querySelector('#canvas-size');
  canvasSelect.addEventListener('change', () =>
    store.set((s) => ({ settings: { ...s.settings, canvasSize: Number(canvasSelect.value) } })));
  const paletteButtons = root.querySelectorAll('[data-palette]');
  const info = root.querySelector('[data-info="export"]');
  const paletteInfo = root.querySelector('[data-info="palette-export"]');

  for (const btn of buttons) {
    btn.addEventListener('click', async () => {
      const { edited, settings, sourceName } = store.get();
      if (!edited?.width) return;
      const factor = Number(btn.dataset.export);
      let img = upscale(exportBase(edited, settings.canvasSize), factor);
      if (settings.output === 'magenta') img = flatten(img);
      const base = (sourceName || 'image').replace(/\.[a-z0-9]+$/i, '');
      download(await toPngBlob(img), `${base}-depix${factor > 1 ? '-x' + factor : ''}.png`);
    });
  }

  for (const btn of paletteButtons) {
    btn.addEventListener('click', async () => {
      const { edited, sourceName } = store.get();
      if (!edited?.width) return;
      const hexes = paletteHexes(edited);
      if (btn.dataset.palette === 'copy') {
        toast((await copyText(hexes.join('\n'))) ? `${hexes.length} codes copiés` : 'Copie impossible');
        return;
      }
      // format .hex : un code par ligne, sans « # » (Aseprite, Lospec…)
      const text = hexes.map((h) => h.slice(1)).join('\n') + '\n';
      const base = (sourceName || 'image').replace(/\.[a-z0-9]+$/i, '');
      download(new Blob([text], { type: 'text/plain' }), `${base}-palette.hex`);
    });
  }

  function render() {
    const { edited, settings } = store.get();
    const ok = Boolean(edited?.width);
    if (ok) {
      // une toile plus petite que l'image ne peut pas la contenir
      const longest = Math.max(edited.width, edited.height);
      for (const opt of canvasSelect.options) opt.disabled = Number(opt.value) > 0 && Number(opt.value) < longest;
      if (settings.canvasSize > 0 && settings.canvasSize < longest) {
        store.set((s) => ({ settings: { ...s.settings, canvasSize: 0 } }));
        return;
      }
    }
    canvasSelect.value = String(settings.canvasSize);
    canvasSelect.disabled = !ok;
    const out = ok ? exportBase(edited, settings.canvasSize) : null;
    for (const btn of paletteButtons) btn.disabled = !ok;
    paletteInfo.textContent = ok ? `${paletteHexes(edited).length} couleurs dans l'image` : '';
    for (const btn of buttons) {
      btn.disabled = !ok;
      const f = Number(btn.dataset.export);
      btn.title = ok ? `${out.width * f} × ${out.height * f} px` : '';
    }
    info.textContent = !ok ? ''
      : out === edited ? `Taille native : ${edited.width} × ${edited.height} px`
        : `Toile ${out.width} × ${out.height} px (image ${edited.width} × ${edited.height} px, centrée)`;
  }
  watch(store, ['edited', 'settings'], render);
  render();
}
