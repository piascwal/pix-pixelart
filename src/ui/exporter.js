// Export PNG : taille native ou agrandie ×2 / ×4 / ×8 au plus proche voisin,
// fond transparent ou magenta #ff00ff selon le réglage.

import { upscale, flatten, fitToCanvas, contentSize } from '../core/upscale.js';
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

/**
 * Image à exporter. Sans toile : l'image telle quelle, agrandie de `factor`.
 * Avec une toile N × N : le sprite agrandi au maximum dans la toile (facteur entier).
 * @returns {{ image, scale }}
 */
export function exportBase(edited, canvasSize, factor = 1) {
  if (!(canvasSize > 0)) return { image: upscale(edited, factor), scale: factor };
  const { image, scale } = fitToCanvas(edited, canvasSize);
  return { image, scale };
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
      const factor = Number(btn.dataset.export) || 1;
      let { image: img } = exportBase(edited, settings.canvasSize, factor);
      if (settings.output === 'magenta') img = flatten(img);
      const base = (sourceName || 'image').replace(/\.[a-z0-9]+$/i, '');
      const suffix = settings.canvasSize > 0 ? `-${settings.canvasSize}` : factor > 1 ? `-x${factor}` : '';
      download(await toPngBlob(img), `${base}-depix${suffix}.png`);
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
    const content = ok ? contentSize(edited) : 0;
    if (ok) {
      // une toile plus petite que le sprite ne peut pas le contenir
      for (const opt of canvasSelect.options) opt.disabled = Number(opt.value) > 0 && Number(opt.value) < content;
      if (settings.canvasSize > 0 && settings.canvasSize < content) {
        store.set((s) => ({ settings: { ...s.settings, canvasSize: 0 } }));
        return;
      }
    }
    canvasSelect.value = String(settings.canvasSize);
    canvasSelect.disabled = !ok;
    const onCanvas = settings.canvasSize > 0;
    for (const btn of paletteButtons) btn.disabled = !ok;
    paletteInfo.textContent = ok ? `${paletteHexes(edited).length} couleurs dans l'image` : '';
    for (const btn of buttons) {
      const fit = btn.dataset.export === 'fit';
      btn.hidden = fit !== onCanvas;
      btn.disabled = !ok;
      const f = Number(btn.dataset.export) || 1;
      btn.title = ok && !fit ? `${edited.width * f} × ${edited.height * f} px` : '';
    }
    if (!ok) info.textContent = '';
    else if (onCanvas) {
      const scale = Math.floor(settings.canvasSize / content);
      info.textContent = `Toile ${settings.canvasSize} × ${settings.canvasSize} px · sprite agrandi ×${scale}`;
    } else info.textContent = `Taille native : ${edited.width} × ${edited.height} px`;
  }
  watch(store, ['edited', 'settings'], render);
  render();
}
