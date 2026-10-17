// Export PNG : taille native ou agrandie ×2 / ×4 / ×8 au plus proche voisin,
// fond transparent ou magenta #ff00ff selon le réglage.

import { upscale, flatten, fitToCanvas, contentSize } from '../core/upscale.js';
import { usedColors } from '../core/palette.js';
import { toHex } from '../core/image.js';
import { watch } from './state.js';
import { copyText, toast } from './clipboard.js';

/** Un poids de fichier lisible : 640 o, 18 Ko, 1,2 Mo. */
export const poids = (octets) =>
  octets < 1024 ? `${octets} o` : octets < 1048576 ? `${Math.round(octets / 1024)} Ko` : `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo`;

/** Ce que donnerait l'export, à la suite de l'état : « · PNG ≈ 18 Ko », ou « · export 256 × 256 ≈ 5 Ko » avec une toile carrée. */
export function resumeExport(t, toile) {
  if (!t) return '';
  const p = t.octets ? ` ≈ ${poids(t.octets)}` : '';
  return toile > 0 ? ` · export ${t.w} × ${t.h}${p}` : t.octets ? ` · PNG${p}` : '';
}

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

/** @param opts.exportLot(factor) : export ZIP du lot, appelé à la place du PNG quand un lot est ouvert */
export function createExporter(root, store, { exportLot } = {}) {
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
      if (store.get().batch && exportLot) return exportLot(factor);
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

  // sous chaque bouton : la taille du fichier qu'il donnerait (dimensions tout de suite, poids du PNG un instant après)
  const MAX_SURFACE_POIDS = 4.2e6;   // au-delà, on n'encode pas juste pour afficher un poids
  const dims = new Map();
  for (const btn of buttons) {
    const small = document.createElement('small');
    small.className = 'dim';
    small.append(document.createElement('span'), document.createElement('span'));
    btn.append(small);
    dims.set(btn, small);
  }
  let minuteur = 0;
  let jeton = 0;

  // la liste des toiles : chaque taille dit ce qu'elle donnerait (agrandissement du sprite et poids du PNG)
  const libelles = new Map([...canvasSelect.options].map((o) => [o, o.textContent]));
  const poidsToile = new Map();
  const texteToile = (opt, content) => {
    const n = Number(opt.value);
    if (!n) return libelles.get(opt);
    const base = libelles.get(opt);
    if (!content || n < content) return base;
    const p = poidsToile.get(n);
    return `${base} · ×${Math.floor(n / content)}${p ? ` · ${poids(p)}` : ''}`;
  };

  /** Publie ce que donnerait l'export principal (celui du réglage de taille choisi) : les autres zones de l'écran l'affichent. */
  function publie(w, h, octets) {
    const t = store.get().tailleExport;
    if (!t || t.w !== w || t.h !== h || t.octets !== octets) store.set({ tailleExport: w ? { w, h, octets } : null });
  }

  /** Encode vraiment chaque export possible (au repos, et seulement s'il n'est pas énorme) pour en donner le poids. */
  function programmePoids() {
    clearTimeout(minuteur);
    const mon = ++jeton;
    minuteur = setTimeout(async () => {
      const { edited, settings, batch } = store.get();
      if (!edited?.width) return;
      const aplati = (img) => (settings.output === 'magenta' ? flatten(img) : img);
      const octets = async (img) => (await toPngBlob(aplati(img))).size;
      // les boutons de la carte (pas pour un lot : un ZIP de tailles variables)
      for (const btn of buttons) {
        if (btn.hidden) continue;
        const f = Number(btn.dataset.export) || 1;
        const surface = settings.canvasSize > 0 ? settings.canvasSize ** 2 : edited.width * edited.height * f * f;
        if (surface > MAX_SURFACE_POIDS) continue;
        const { image: img } = exportBase(edited, settings.canvasSize, f);
        const taille = await octets(img);
        if (mon !== jeton) return;       // un réglage a changé entre-temps
        if (!batch) {
          const [d, pd] = dims.get(btn).children;
          d.textContent = `${img.width} × ${img.height}`;
          pd.textContent = poids(taille);
        }
        if (btn.dataset.export === 'fit' || btn.dataset.export === '1') publie(img.width, img.height, taille);
      }
      // chaque toile carrée de la liste
      const content = contentSize(edited);
      for (const opt of canvasSelect.options) {
        const n = Number(opt.value);
        if (!n || n < content || n ** 2 > MAX_SURFACE_POIDS) continue;
        const taille = await octets(fitToCanvas(edited, n).image);
        if (mon !== jeton) return;
        poidsToile.set(n, taille);
        opt.textContent = texteToile(opt, content);
      }
    }, 350);
  }

  function render() {
    const { edited, settings, batch, exporting } = store.get();
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
    poidsToile.clear();
    for (const opt of canvasSelect.options) opt.textContent = texteToile(opt, content);
    canvasSelect.value = String(settings.canvasSize);
    canvasSelect.disabled = !ok;
    const onCanvas = settings.canvasSize > 0;
    for (const btn of paletteButtons) btn.disabled = !ok;
    paletteInfo.textContent = ok ? `${paletteHexes(edited).length} couleurs dans l'image` : '';
    for (const btn of buttons) {
      const fit = btn.dataset.export === 'fit';
      btn.hidden = fit !== onCanvas;
      btn.disabled = !ok || exporting;
      const f = Number(btn.dataset.export) || 1;
      btn.title = '';
      // les dimensions se savent tout de suite ; dans un lot, la taille varie d'une image à l'autre (sauf toile carrée)
      const [w, h] = !ok ? [0, 0] : onCanvas ? [settings.canvasSize, settings.canvasSize] : [edited.width * f, edited.height * f];
      const [d, pd] = dims.get(btn).children;
      d.textContent = ok && (onCanvas || !batch) ? `${w} × ${h}` : '';
      if (!ok || batch) pd.textContent = '';
    }
    publie(...(!ok ? [0, 0] : onCanvas ? [settings.canvasSize, settings.canvasSize] : [edited.width, edited.height]), null);
    programmePoids();
    const lot = batch ? `Lot de ${batch.items.length} images : export en ZIP. ` : '';
    for (const btn of buttons) if (btn.dataset.export === 'fit') btn.querySelector('span').textContent = batch ? 'Télécharger le ZIP' : 'Télécharger le PNG';
    if (!ok) info.textContent = '';
    else if (onCanvas) {
      const scale = Math.floor(settings.canvasSize / content);
      info.textContent = `${lot}Toile ${settings.canvasSize} × ${settings.canvasSize} px · sprite agrandi ×${scale}`;
    } else info.textContent = `${lot}Taille native : ${edited.width} × ${edited.height} px`;
  }
  watch(store, ['edited', 'editVersion', 'settings', 'batch', 'exporting'], render);
  render();
}
