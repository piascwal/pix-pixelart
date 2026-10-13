// Lot d'images : plusieurs images importées d'un coup. L'image choisie dans la liste
// s'ouvre comme d'habitude (aperçu, réglages, retouches) ; « Tout exporter » convertit
// chaque image avec les réglages courants (grille et fond détectés image par image)
// et regroupe les PNG dans un ZIP. L'image ouverte est exportée avec ses retouches.
// Les boutons d'export de la carte « Exporter » déclenchent cet export quand un lot est ouvert.

import { zip, uniqueNames } from '../core/zip.js';
import { flatten } from '../core/upscale.js';
import { watch } from './state.js';
import { download, toPngBlob, exportBase } from './exporter.js';
import { toast } from './clipboard.js';

/**
 * @param root     section #batch
 * @param opts.ask (message, transfer) → Promise : le worker
 * @param opts.open(item) : ouvre l'image dans l'éditeur
 */
export function createBatch(root, store, { ask, open }) {
  const list = root.querySelector('#batch-list');
  const states = new Map();   // item → texte d'état
  let running = false;

  function render() {
    const { batch } = store.get();
    root.hidden = !batch;
    if (!batch) return;
    list.replaceChildren();
    batch.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'batch-item' + (i === batch.active ? ' is-active' : '') + (states.get(item)?.error ? ' is-error' : '');
      const thumb = document.createElement('canvas');
      thumb.width = 40; thumb.height = 40;
      const ctx = thumb.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const k = Math.min(40 / item.image.width, 40 / item.image.height);
      ctx.drawImage(item.bitmap, 0, 0, item.image.width * k, item.image.height * k);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = item.name;
      name.title = item.name;
      const state = document.createElement('span');
      state.className = 'state';
      state.textContent = states.get(item)?.text || '';
      li.append(thumb, name, state);
      li.addEventListener('click', () => {
        if (running || i === store.get().batch.active) return;
        store.set((s) => ({ batch: { ...s.batch, active: i } }));
        open(item);
      });
      list.append(li);
    });
  }

  /** Exporte tout le lot en ZIP : `factor` = agrandissement (ignoré si une toile carrée est choisie). */
  async function exportAll(factor = 1) {
    const { batch, settings } = store.get();
    if (!batch || running) return;
    running = true;
    store.set({ exporting: true });
    states.clear();
    const files = [];
    const names = [];
    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      states.set(item, { text: '…' });
      render();
      try {
        const { edited } = store.get();
        let image;
        if (i === store.get().batch.active && edited?.width) image = edited;
        else {
          const copy = { width: item.image.width, height: item.image.height, data: new Uint8ClampedArray(item.image.data) };
          image = (await ask({ type: 'process', image: copy, settings }, [copy.data.buffer])).result.image;
        }
        let { image: out } = exportBase(image, settings.canvasSize, factor);
        if (settings.output === 'magenta') out = flatten(out);
        const blob = await toPngBlob(out);
        files.push(new Uint8Array(await blob.arrayBuffer()));
        names.push(`${item.name.replace(/\.[a-z0-9]+$/i, '')}-depix.png`);
        states.set(item, { text: `${out.width}×${out.height}` });
      } catch (err) {
        states.set(item, { text: err instanceof RangeError ? 'trop grand pour la toile' : 'échec', error: true });
      }
      render();
    }
    running = false;
    store.set({ exporting: false });
    if (files.length) {
      const unique = uniqueNames(names);
      download(new Blob([zip(files.map((data, k) => ({ name: unique[k], data })))], { type: 'application/zip' }), 'depix-lot.zip');
      toast(`${files.length} image${files.length > 1 ? 's' : ''} exportée${files.length > 1 ? 's' : ''}`);
    } else toast('Aucune image exportée');
    render();
  }

  watch(store, ['batch'], render);
  render();
  return { exportAll };
}
