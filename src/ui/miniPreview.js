// Aperçu flottant (téléphone, tablette) : quand on règle un curseur plus bas
// dans la page, le résultat n'est plus à l'écran. Une bande fixe en haut le
// montre en direct dès que moins de la moitié du panneau « Vrai pixel art »
// reste visible ; la toucher ramène à l'image. Sur ordinateur, l'image et les
// réglages sont côte à côte : rien.

import { watch } from './state.js';

const BOX_W = 112;
const BOX_H = 72;

export function createMiniPreview(root, store, watched, scrollTarget) {
  const canvas = root.querySelector('canvas');
  const info = root.querySelector('[data-info="mini"]');
  const narrow = window.matchMedia('(max-width: 999px)');
  const bitmap = document.createElement('canvas');
  let outOfView = false;

  function drawPreview() {
    const { edited, result, settings } = store.get();
    if (!edited?.width || !edited?.height) return;
    // entier quand on agrandit (cases nettes), sinon au plus près pour tenir dans la boîte
    let scale = Math.min(BOX_W / edited.width, BOX_H / edited.height);
    if (scale >= 1) scale = Math.floor(scale);
    const w = Math.max(1, Math.round(edited.width * scale));
    const h = Math.max(1, Math.round(edited.height * scale));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    bitmap.width = edited.width;
    bitmap.height = edited.height;
    bitmap.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(edited.data), edited.width, edited.height), 0, 0);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (settings.output === 'magenta') {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    info.textContent = `${edited.width} × ${edited.height} px${result ? ` · ${result.stats.colors} couleurs` : ''}`;
  }

  function update() {
    const { edited } = store.get();
    const show = narrow.matches && outOfView && Boolean(edited?.width);
    if (show && root.hidden) drawPreview();
    root.hidden = !show;
  }

  // « hors de vue » : moins de la moitié visible, et on l'a dépassé en défilant vers le bas
  new IntersectionObserver(([entry]) => {
    outOfView = entry.intersectionRatio < 0.5 && entry.boundingClientRect.top < 0;
    update();
  }, { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 1] }).observe(watched);

  watch(store, ['edited', 'editVersion', 'settings'], () => { if (!root.hidden) drawPreview(); });
  watch(store, ['edited'], update);
  narrow.addEventListener('change', update);

  root.addEventListener('click', () => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
