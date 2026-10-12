// Outil Pointeur : toucher une case du résultat (ou de l'original, au même
// endroit) affiche sa fiche : code hexa, et deux retouches, annulables comme les
// autres : la supprimer (transparente) ou la remplacer par une couleur déjà
// présente dans l'image. Chacune s'applique à cette case seule, ou à toutes les
// cases de l'image qui ont exactement cette couleur (réglage « Cette case /
// Toute l'image »). Pour agir à la conversion, sur la palette, voir le nuancier.

import { toHex } from '../core/image.js';
import { usedColors } from '../core/palette.js';
import { watch } from './state.js';
import { copyText, toast } from './clipboard.js';
import { icon } from './icons.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function button(label, onClick, { primary = false, iconName, title } = {}) {
  const b = el('button', 'btn btn-small' + (primary ? ' btn-primary' : ''));
  b.type = 'button';
  if (iconName) b.append(icon(iconName));
  if (label) b.append(label);
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', onClick);
  return b;
}

/** Nombre de cases opaques d'une couleur exacte. */
function countColor(img, [r, g, b]) {
  let n = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === r && d[i + 1] === g && d[i + 2] === b) n++;
  return n;
}

export function createInspector(container, store, editor) {
  let choosing = false; // on attend le choix de la nouvelle couleur

  function select(cell) {
    choosing = false;
    store.set({ pixelSel: cell });
  }

  const plural = (n) => `${n} case${n > 1 ? 's' : ''}`;

  /** Applique la retouche à la case ou à toute l'image selon le réglage. */
  function apply(rgb, cell, to) {
    if (store.get().pixelScope === 'all') {
      const n = editor.replaceColor(rgb, to);
      if (n) toast(`${plural(n)} ${to ? 'recolorée' + (n > 1 ? 's' : '') : 'supprimée' + (n > 1 ? 's' : '')}`);
    } else {
      editor.setPixel(cell, to);
    }
  }

  function render() {
    const { tool, pixelSel, edited, pixelScope } = store.get();
    container.replaceChildren();
    const outOfRange = pixelSel && edited && (pixelSel.x >= edited.width || pixelSel.y >= edited.height);
    container.hidden = tool !== 'inspect' || !pixelSel || !edited || outOfRange;
    if (container.hidden) return;

    const i = (pixelSel.y * edited.width + pixelSel.x) * 4;
    const d = edited.data;
    const empty = d[i + 3] === 0;
    const rgb = [d[i], d[i + 1], d[i + 2]];
    const hex = toHex(rgb);
    const same = empty ? 0 : countColor(edited, rgb);

    const head = el('div', 'pixel-head');
    const swatch = el('span', 'pixel-swatch' + (empty ? ' is-empty' : ''));
    if (!empty) swatch.style.background = hex;
    const names = el('div', 'pixel-names');
    names.append(
      empty ? el('strong', null, 'Case vide') : el('code', 'pixel-hex', hex),
      el('span', 'hint', empty ? `transparente · case ${pixelSel.x + 1}, ${pixelSel.y + 1}` : `rvb(${rgb.join(', ')}) · case ${pixelSel.x + 1}, ${pixelSel.y + 1}`),
    );
    head.append(swatch, names);
    if (!empty) {
      head.append(button('', async () => toast((await copyText(hex)) ? `${hex} copié` : 'Copie impossible'),
        { iconName: 'copy', title: 'Copier le code hexa' }));
    }
    head.append(button('', () => select(null), { iconName: 'x', title: 'Fermer' }));
    container.append(head);

    // portée : cette case, ou toutes les cases de cette couleur (inutile s'il n'y en a qu'une)
    if (!empty && same > 1) {
      const scope = el('div', 'segmented segmented-full');
      scope.setAttribute('role', 'group');
      scope.setAttribute('aria-label', 'Portée de la retouche');
      for (const [value, label] of [['one', 'Cette case'], ['all', `Toute l'image (${same})`]]) {
        const b = el('button', null, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(pixelScope === value));
        b.addEventListener('click', () => store.set({ pixelScope: value }));
        scope.append(b);
      }
      container.append(scope);
    }
    const all = !empty && same > 1 && pixelScope === 'all';

    if (choosing) {
      container.append(el('p', 'detail-prompt', 'Choisissez une couleur déjà présente dans l’image.'));
      const grid = el('div', 'swatches');
      for (const c of usedColors(edited)) {
        const h = toHex(c);
        const b = el('button', 'swatch' + (!empty && h === hex ? ' is-selected' : ''));
        b.type = 'button';
        b.style.background = h;
        b.title = h;
        b.setAttribute('aria-label', `Couleur ${h}`);
        b.addEventListener('click', () => {
          choosing = false;
          if (all) apply(rgb, pixelSel, c); else editor.setPixel(pixelSel, c);
        });
        grid.append(b);
      }
      container.append(grid, button('Annuler', () => { choosing = false; render(); }));
      return;
    }

    const actions = el('div', 'pixel-actions');
    actions.append(button(empty ? 'Colorier avec…' : 'Remplacer par…', () => { choosing = true; render(); },
      { primary: true, iconName: 'replace' }));
    if (!empty) {
      actions.append(button('Supprimer', () => { if (all) apply(rgb, pixelSel, null); else editor.setPixel(pixelSel, null); },
        { iconName: 'trash-2' }));
    }
    container.append(actions);
  }

  watch(store, ['tool', 'pixelSel', 'edited', 'editVersion', 'pixelScope'], render);

  // une nouvelle conversion change la grille : l'ancienne sélection n'a plus de sens
  watch(store, ['result'], () => select(null));
  // quitter l'outil referme la fiche
  watch(store, ['tool'], (s) => { if (s.tool !== 'inspect' && s.pixelSel) select(null); });

  window.addEventListener('keydown', (e) => {
    const s = store.get();
    if (s.tool !== 'inspect' || !s.pixelSel || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const i = (s.pixelSel.y * s.edited.width + s.pixelSel.x) * 4;
      const d = s.edited.data;
      if (d[i + 3]) apply([d[i], d[i + 1], d[i + 2]], s.pixelSel, null);
    }
    if (e.key === 'Escape') select(null);
  });

  render();
  return { select };
}
