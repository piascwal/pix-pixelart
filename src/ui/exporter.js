// Export PNG : taille native ou agrandie ×2 / ×4 / ×8 au plus proche voisin,
// fond transparent ou magenta #ff00ff selon le réglage.

import { upscale, flatten } from '../core/upscale.js';
import { watch } from './state.js';

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

export function createExporter(root, store) {
  const buttons = root.querySelectorAll('[data-export]');
  const info = root.querySelector('[data-info="export"]');

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

  function render() {
    const { edited } = store.get();
    const ok = Boolean(edited?.width);
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
