// Export PNG : taille native ou agrandie ×2 / ×4 / ×8 au plus proche voisin,
// fond transparent ou magenta #ff00ff selon le réglage.

import { upscale, flatten } from '../core/upscale.js';
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

function download(blob, name) {
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

export function createExporter(root, store) {
  const buttons = root.querySelectorAll('[data-export]');
  const paletteButtons = root.querySelectorAll('[data-palette]');
  const info = root.querySelector('[data-info="export"]');
  const paletteInfo = root.querySelector('[data-info="palette-export"]');

  for (const btn of buttons) {
    btn.addEventListener('click', async () => {
      const { edited, settings, sourceName } = store.get();
      if (!edited?.width) return;
      const factor = Number(btn.dataset.export);
      let img = upscale(edited, factor);
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
    const { edited } = store.get();
    const ok = Boolean(edited?.width);
    for (const btn of paletteButtons) btn.disabled = !ok;
    paletteInfo.textContent = ok ? `${paletteHexes(edited).length} couleurs dans l'image` : '';
    for (const btn of buttons) {
      btn.disabled = !ok;
      const f = Number(btn.dataset.export);
      btn.title = ok ? `${edited.width * f} × ${edited.height * f} px` : '';
    }
    info.textContent = ok ? `Taille native : ${edited.width} × ${edited.height} px` : '';
  }
  watch(store, ['edited'], render);
  render();
}
