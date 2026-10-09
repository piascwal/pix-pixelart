// Nuancier : les couleurs de la palette ; un clic choisit la couleur du crayon.

import { toHex } from '../core/image.js';
import { watch } from './state.js';

export function createPaletteView(container, store) {
  function render() {
    const { result, color } = store.get();
    container.replaceChildren();
    if (!result) return;
    const current = color ? toHex(color) : '';
    for (const rgb of result.palette) {
      const hex = toHex(rgb);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (hex === current ? ' is-selected' : '');
      b.style.background = hex;
      b.title = `${hex} — rvb(${rgb.join(', ')})`;
      b.setAttribute('aria-label', `Couleur ${hex}`);
      b.setAttribute('aria-pressed', String(hex === current));
      b.addEventListener('click', () => store.set({ color: rgb, tool: 'pencil' }));
      container.append(b);
    }
  }

  watch(store, ['result', 'color'], render);

  // à chaque nouvelle palette, le crayon prend une couleur qui en fait partie
  watch(store, ['result'], ({ result, color }) => {
    if (!result?.palette.length) return;
    const hexes = result.palette.map(toHex);
    if (!color || !hexes.includes(toHex(color))) store.set({ color: result.palette[result.palette.length - 1] });
  });

  render();
}
