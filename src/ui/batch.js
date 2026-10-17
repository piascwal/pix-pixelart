// Lot d'images : plusieurs images importées d'un coup. L'image choisie dans la liste
// s'ouvre comme d'habitude (aperçu, réglages, retouches) ; « Tout exporter » convertit
// chaque image avec les réglages courants (grille et fond détectés image par image)
// et regroupe les PNG dans un ZIP. Les retouches (crayon, gomme, pointeur) et les choix de palette
// de chaque image sont gardés quand on passe à une autre, puis retrouvés à l'export (tant que les
// réglages communs n'ont pas changé : voir `empreinte`).
// Les boutons d'export de la carte « Exporter » déclenchent cet export quand un lot est ouvert.

import { zip, uniqueNames } from '../core/zip.js';
import { flatten } from '../core/upscale.js';
import { cloneImage } from '../core/image.js';
import { watch } from './state.js';
import { download, toPngBlob, exportBase } from './exporter.js';
import { toast } from './clipboard.js';
import { icon } from './icons.js';

/** Les réglages qui changent le résultat d'une conversion (la grille détectée est propre à chaque image : omise sauf si fixée). */
const REGLAGES = ['colors', 'tolerance', 'cleanup', 'minIsland', 'gridMode', 'removeBg', 'paletteRules'];

/**
 * Ce qui fait qu'une retouche vaut encore : si l'empreinte des réglages a changé, le résultat n'a plus la même
 * grille ni les mêmes couleurs, et les retouches ne tombent plus sur les bonnes cases.
 */
export function empreinte(s) {
  const grille = s.gridMode === 'target' ? [s.targetSize] : s.gridLocked ? [s.period, s.offsetX, s.offsetY] : [];
  return JSON.stringify([REGLAGES.map((k) => s[k]), grille]);
}

const memes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * @param root     section #batch
 * @param opts.ask (message, transfer) → Promise : le worker
 * @param opts.open(item) : ouvre l'image dans l'éditeur
 */
export function createBatch(root, store, { ask, open }) {
  const list = root.querySelector('#batch-list');
  const states = new Map();   // item → texte d'état
  let running = false;

  /** Garde l'état de l'image ouverte (retouches, choix de palette) sur son élément du lot, avant de la quitter. */
  function garde() {
    const { batch, edited, result, settings } = store.get();
    if (!batch) return;
    const item = batch.items[batch.active];
    if (!item) return;
    const retouchee = edited && result && !memes(edited.data, result.image.data);
    item.etat = {
      empreinte: empreinte(settings),
      regles: settings.paletteRules,
      edited: retouchee ? cloneImage(edited) : null,
    };
  }

  /** Ouvre une image du lot : elle retrouve ses choix de palette ; ses retouches reviennent avec son résultat. */
  function ouvre(item) {
    open(item);
    if (item.etat) store.set((s) => ({ settings: { ...s.settings, paletteRules: item.etat.regles } }));
  }

  // le résultat de l'image ouverte arrive : on lui remet ses retouches si les réglages n'ont pas bougé
  watch(store, ['result'], ({ batch, result, settings }) => {
    const item = batch?.items[batch.active];
    const etat = item?.etat;
    if (!result || !etat?.edited || etat.empreinte !== empreinte(settings)) return;
    if (etat.edited.width !== result.image.width || etat.edited.height !== result.image.height) return;
    store.set((s) => ({ edited: cloneImage(etat.edited), editVersion: s.editVersion + 1 }));
  });

  /** Sort l'image i du lot ; s'il n'en reste qu'une, ce n'est plus un lot. */
  function remove(i) {
    const { batch } = store.get();
    if (!batch || running) return;
    const items = batch.items.filter((_, k) => k !== i);
    const wasActive = i === batch.active;
    if (items.length <= 1) {
      store.set({ batch: null });
      if (wasActive && items[0]) ouvre(items[0]);
      return;
    }
    const active = i < batch.active ? batch.active - 1 : Math.min(batch.active, items.length - 1);
    store.set({ batch: { items, active } });
    if (wasActive) ouvre(items[active]);
  }

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
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-btn';
      rm.append(icon('x'));
      rm.setAttribute('aria-label', 'Retirer du lot');
      rm.dataset.tip = 'Retirer du lot';
      rm.disabled = running;
      rm.addEventListener('click', (e) => { e.stopPropagation(); remove(i); });
      li.append(thumb, name, state, rm);
      li.addEventListener('click', () => {
        if (running || i === store.get().batch.active) return;
        garde();
        store.set((s) => ({ batch: { ...s.batch, active: i } }));
        ouvre(item);
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
    let retouchesPerdues = 0;
    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      states.set(item, { text: '…' });
      render();
      try {
        const { edited } = store.get();
        let image;
        if (i === store.get().batch.active && edited?.width) image = edited;
        else {
          // ses choix de palette et ses retouches, si elles valent encore avec les réglages d'aujourd'hui
          const reglages = item.etat ? { ...settings, paletteRules: item.etat.regles } : settings;
          if (item.etat?.edited && item.etat.empreinte === empreinte(reglages)) image = item.etat.edited;
          else {
            const copy = { width: item.image.width, height: item.image.height, data: new Uint8ClampedArray(item.image.data) };
            image = (await ask({ type: 'process', image: copy, settings: reglages }, [copy.data.buffer])).result.image;
            if (item.etat?.edited) retouchesPerdues++;
          }
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
      toast(
        `${files.length} image${files.length > 1 ? 's' : ''} exportée${files.length > 1 ? 's' : ''}` +
          (retouchesPerdues ? ` · retouches de ${retouchesPerdues} image${retouchesPerdues > 1 ? 's' : ''} ignorées (réglages changés)` : ''),
      );
    } else toast('Aucune image exportée');
    render();
  }

  watch(store, ['batch'], render);
  render();
  return { exportAll };
}
