// Nuancier : clic sur une couleur → sa fiche (code hexa, copier), puis :
//   - ne pas l'utiliser : ses pixels deviennent transparents (comme une gomme) ;
//   - la remplacer par une autre couleur de la palette ;
//   - dessiner avec (crayon).
// Les choix sont des règles dans settings.paletteRules (par code hexa) : la
// conversion les applique (core/palette.js, resolvePalette) et redessine.

import { toHex } from '../core/image.js';
import { EMPTY_RULES, TRANSPARENT } from '../core/palette.js';
import { watch } from './state.js';
import { copyText, toast } from './clipboard.js';
import { icon } from './icons.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function button(label, onClick, { primary = false, disabled = false, icon: name } = {}) {
  const b = el('button', 'btn btn-small' + (primary ? ' btn-primary' : ''));
  if (name) b.append(icon(name));
  b.append(label);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function miniSwatch(hex) {
  const s = el('span', 'mini-swatch' + (hex === TRANSPARENT ? ' is-transparent' : ''));
  if (hex !== TRANSPARENT) s.style.background = hex;
  return s;
}

export function createPaletteView(container, detail, store) {
  const rules = () => store.get().settings.paletteRules || EMPTY_RULES;

  function setRules(next) {
    store.set((s) => ({ settings: { ...s.settings, paletteRules: next } }));
  }

  const toggleExcluded = (hex) => {
    const r = rules();
    const isExcluded = r.excluded.includes(hex);
    const replace = { ...r.replace };
    if (!isExcluded) delete replace[hex]; // exclure et remplacer s'opposent
    setRules({
      excluded: isExcluded ? r.excluded.filter((h) => h !== hex) : [...r.excluded, hex],
      replace,
    });
  };

  const setReplacement = (from, to) => {
    const r = rules();
    setRules({ excluded: r.excluded.filter((h) => h !== from), replace: { ...r.replace, [from]: to } });
  };

  const clearReplacement = (from) => {
    const replace = { ...rules().replace };
    delete replace[from];
    setRules({ ...rules(), replace });
  };

  /* ------------------------------------------------------------ nuancier */

  function onSwatch(hex, rgb) {
    const { paletteSel, paletteReplacing } = store.get();
    const r = rules();
    if (paletteReplacing && paletteSel) {
      // on attend la couleur de remplacement : ni elle-même, ni une couleur écartée
      if (hex === paletteSel || r.excluded.includes(hex)) return;
      setReplacement(paletteSel, hex);
      store.set({ paletteReplacing: false });
      return;
    }
    store.set({ paletteSel: hex === paletteSel ? null : hex, paletteReplacing: false, color: rgb });
  }

  function renderSwatches() {
    const { result, paletteSel, paletteReplacing } = store.get();
    const r = rules();
    container.replaceChildren();
    if (!result) return;
    if (paletteReplacing) {
      // toujours proposé en premier : rendre ses pixels transparents
      const t = el('button', 'swatch is-transparent is-target');
      t.type = 'button';
      t.title = 'Transparent';
      t.setAttribute('aria-label', 'Remplacer par transparent');
      t.addEventListener('click', () => {
        setReplacement(store.get().paletteSel, TRANSPARENT);
        store.set({ paletteReplacing: false });
      });
      container.append(t);
    }
    for (const rgb of result.palette) {
      const hex = toHex(rgb);
      const excluded = r.excluded.includes(hex);
      const target = r.replace[hex];
      const b = el('button', 'swatch');
      b.type = 'button';
      b.style.background = hex;
      if (hex === paletteSel) b.classList.add('is-selected');
      if (excluded) b.classList.add('is-excluded');
      if (target) {
        b.classList.add('is-replaced');
        const badge = el('span', 'swatch-badge' + (target === TRANSPARENT ? ' is-transparent' : ''));
        if (target !== TRANSPARENT) badge.style.background = target;
        b.append(badge);
      }
      if (paletteReplacing) {
        const valid = hex !== paletteSel && !excluded;
        b.classList.add(valid ? 'is-target' : 'is-dimmed');
        b.disabled = !valid && hex !== paletteSel;
      }
      const status = excluded ? ', transparente' : target ? `, remplacée par ${target}` : '';
      b.title = `${hex}${status}`;
      b.setAttribute('aria-label', `Couleur ${hex}${status}`);
      b.setAttribute('aria-pressed', String(hex === paletteSel));
      b.addEventListener('click', () => onSwatch(hex, rgb));
      container.append(b);
    }
  }

  /* --------------------------------------------------------------- fiche */

  function renderDetail() {
    const { result, paletteSel, paletteReplacing } = store.get();
    const rgb = result?.palette.find((c) => toHex(c) === paletteSel);
    detail.replaceChildren();
    detail.hidden = !rgb;
    if (!rgb) return;

    const r = rules();
    const hex = paletteSel;
    const excluded = r.excluded.includes(hex);
    const target = r.replace[hex];
    const active = result.palette.filter((c) => !r.excluded.includes(toHex(c)));

    const head = el('div', 'detail-head');
    const big = el('span', 'detail-swatch');
    big.style.background = hex;
    const names = el('div', 'detail-names');
    names.append(el('code', 'detail-hex', hex), el('span', 'hint', `rvb(${rgb.join(', ')})`));
    const copy = button('Copier', async () => {
      toast((await copyText(hex)) ? `${hex} copié` : 'Copie impossible');
    }, { icon: 'copy' });
    head.append(big, names, copy);

    const status = el('p', 'hint');
    if (target) {
      status.append('Remplacée par ', miniSwatch(target), target === TRANSPARENT ? ' transparent' : ` ${target}`);
    } else if (excluded) {
      status.textContent = 'Transparente : tous ses pixels sont effacés.';
    } else {
      status.textContent = 'Utilisée dans le résultat.';
    }
    detail.append(head, status);

    if (paletteReplacing) {
      detail.append(
        el('p', 'detail-prompt', 'Touchez la couleur du nuancier qui doit la remplacer, ou transparent.'),
        button('Annuler', () => store.set({ paletteReplacing: false })),
      );
      return;
    }

    const actions = el('div', 'detail-actions');
    if (!excluded) {
      actions.append(button('Dessiner avec', () => store.set({ color: rgb, tool: 'pencil' }), { primary: true, icon: 'pencil' }));
    }
    actions.append(
      excluded
        ? button('Utiliser à nouveau', () => toggleExcluded(hex))
        : button('Ne pas utiliser', () => toggleExcluded(hex), { disabled: active.length <= 1, icon: 'ban' }),
      target
        ? button('Ne plus remplacer', () => clearReplacement(hex))
        : button('Remplacer par…', () => store.set({ paletteReplacing: true }),
          { disabled: excluded || active.length <= 1, icon: 'replace' }),
    );
    detail.append(actions);
  }

  const touched = (r) => Boolean(r.excluded.length || Object.keys(r.replace).length);

  const resetBtn = detail.parentElement?.querySelector('[data-action="palette-reset"]');
  resetBtn?.addEventListener('click', () => {
    setRules(EMPTY_RULES);
    store.set({ paletteReplacing: false });
  });

  function render() {
    const { result, paletteSel } = store.get();
    // la sélection suit la palette : si la couleur n'existe plus, on la lâche
    if (paletteSel && !result?.palette.some((c) => toHex(c) === paletteSel)) {
      store.set({ paletteSel: null, paletteReplacing: false });
      return;
    }
    renderSwatches();
    renderDetail();
    if (resetBtn) resetBtn.hidden = !touched(rules());
  }

  watch(store, ['result', 'paletteSel', 'paletteReplacing', 'settings'], render);

  // Échap abandonne le choix d'une couleur de remplacement
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.get().paletteReplacing) store.set({ paletteReplacing: false });
  });

  // à chaque nouvelle palette, le crayon prend une couleur qui en fait partie
  watch(store, ['result'], ({ result, color }) => {
    if (!result?.palette.length) return;
    const hexes = result.palette.map(toHex);
    if (!color || !hexes.includes(toHex(color))) store.set({ color: result.palette[result.palette.length - 1] });
  });

  render();
}
