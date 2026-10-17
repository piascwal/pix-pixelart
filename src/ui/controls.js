// Panneau de réglages : grille (taille, décalages), palette, fond, nettoyage.
// Chaque réglage = un curseur couplé à un champ numérique (précis sur mobile).

import { EMPTY_RULES } from '../core/palette.js';
import { targetGrid } from '../core/gridDetect.js';
import { watch } from './state.js';

const fmt = (v, step) => (step < 1 ? Number(v).toFixed(String(step).split('.')[1].length) : String(Math.round(v)));

/** En mode « taille choisie », la grille découle de la taille voulue et de l'image de travail. */
export function withTargetGrid(settings, source) {
  if (settings.gridMode !== 'target' || !source) return settings;
  return { ...settings, ...targetGrid(source.width, source.height, settings.targetSize) };
}

/**
 * Relie un curseur + champ numérique à settings[key].
 * Le HTML porte : <input type="range" data-setting="key"> et <input type="number" data-setting="key">
 */
const GRID_KEYS = new Set(['period', 'offsetX', 'offsetY']);

function bindNumber(root, store, key) {
  const s0 = () => store.get();
  const inputs = root.querySelectorAll(`[data-setting="${key}"]`);
  const commit = (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    // une autre palette n'a plus les mêmes codes hexa : les choix manuels n'auraient plus de sens
    const reset = key === 'colors' ? { paletteRules: EMPTY_RULES } : {};
    // dans un lot, régler la grille à la main la fixe pour toutes les images
    const lock = GRID_KEYS.has(key) && s0().batch ? { gridLocked: true } : {};
    store.set((s) => ({ settings: withTargetGrid({ ...s.settings, [key]: v, ...reset, ...lock }, s.source) }));
  };
  for (const input of inputs) {
    input.addEventListener('input', () => {
      // en pleine saisie, « », « 1 » (avant « 12 ») ou « 0 » ne sont pas des réglages : on attend une valeur dans les bornes
      const raw = input.value.trim();
      const v = Number(raw);
      if (raw === '' || !Number.isFinite(v)) return;
      if (input.type === 'number' && (v < Number(input.min) || v > Number(input.max))) return;
      commit(v);
    });
    // la saisie est finie (Entrée, Tab, clic ailleurs) : une valeur hors bornes ou vide est ramenée dans les bornes
    if (input.type === 'number') {
      input.addEventListener('change', () => {
        const v = Number(input.value);
        const min = Number(input.min);
        const max = Number(input.max);
        const actuel = store.get().settings[key];
        const borne = !input.value.trim() || !Number.isFinite(v) ? actuel : Math.min(max, Math.max(min, v));
        commit(borne);
        input.value = fmt(borne, Number(input.step) || 1);
      });
    }
  }
  return (settings) => {
    for (const input of inputs) {
      if (document.activeElement === input && input.type === 'number') continue;
      input.value = fmt(settings[key], Number(input.step) || 1);
    }
  };
}

export function createControls(root, store) {
  const updaters = ['period', 'offsetX', 'offsetY', 'colors', 'tolerance', 'minIsland', 'targetSize']
    .map((key) => bindNumber(root, store, key));

  const cleanup = root.querySelector('[data-setting="cleanup"]');
  cleanup.addEventListener('change', () =>
    store.set((s) => ({ settings: { ...s.settings, cleanup: cleanup.checked } })));

  const removeBg = root.querySelector('[data-setting="removeBg"]');
  removeBg.addEventListener('change', () =>
    store.set((s) => ({ settings: { ...s.settings, removeBg: removeBg.checked } })));

  // mode de la grille : détectée (faux pixel art, par défaut) ou taille choisie (photo)
  const modes = root.querySelectorAll('[name="gridmode"]');
  for (const radio of modes) {
    radio.addEventListener('change', () => store.set((s) => {
      let settings = { ...s.settings, gridMode: radio.value, removeBg: radio.value === 'detect' };
      if (radio.value === 'detect' && s.detected) {
        const { period, offsetX, offsetY } = s.detected.grid;
        settings = { ...settings, period, offsetX, offsetY, gridLocked: false };
      }
      return { settings: withTargetGrid(settings, s.source) };
    }));
  }
  const presets = root.querySelectorAll('[data-target]');
  for (const btn of presets) {
    btn.addEventListener('click', () => store.set((s) =>
      ({ settings: withTargetGrid({ ...s.settings, targetSize: Number(btn.dataset.target) }, s.source) })));
  }
  const panels = root.querySelectorAll('[data-mode-panel]');
  const removeBgRow = root.querySelector('[data-row="removeBg"]');
  const toleranceRow = root.querySelector('[data-row="tolerance"]');
  const targetInfo = root.querySelector('[data-info="target-result"]');

  const outputs = root.querySelectorAll('[name="output"]');
  for (const radio of outputs) {
    radio.addEventListener('change', () =>
      store.set((s) => ({ settings: { ...s.settings, output: radio.value } })));
  }

  root.querySelector('[data-action="auto-grid"]').addEventListener('click', () => {
    const { detected } = store.get();
    if (!detected) return;
    const { period, offsetX, offsetY } = detected.grid;
    store.set((s) => ({ settings: { ...s.settings, period, offsetX, offsetY, gridLocked: false } }));
  });

  const detectedInfo = root.querySelector('[data-info="detected"]');
  const islandRow = root.querySelector('[data-row="minIsland"]');

  function render() {
    const { settings, detected, source } = store.get();
    for (const u of updaters) u(settings);
    const target = settings.gridMode === 'target';
    for (const radio of modes) radio.checked = radio.value === settings.gridMode;
    for (const p of panels) p.hidden = p.dataset.modePanel !== settings.gridMode;
    for (const btn of presets) btn.setAttribute('aria-pressed', String(Number(btn.dataset.target) === Math.round(settings.targetSize)));
    removeBg.checked = settings.removeBg;
    removeBgRow.hidden = !target;
    toleranceRow.hidden = target && !settings.removeBg;   // sans retrait du fond, la tolérance ne sert à rien
    targetInfo.textContent = target && source
      ? `Résultat : ${Math.max(1, Math.round(source.width / settings.period))} × ${Math.max(1, Math.round(source.height / settings.period))} px (image source ${source.width} × ${source.height} px).`
      : '';
    cleanup.checked = settings.cleanup;
    islandRow.hidden = !settings.cleanup;
    for (const radio of outputs) radio.checked = radio.value === settings.output;
    // le décalage n'a de sens qu'entre 0 et la taille d'une case
    for (const el of root.querySelectorAll('[data-setting="offsetX"], [data-setting="offsetY"]')) {
      el.max = String(Math.max(0, Math.ceil(settings.period * 4) / 4 - 0.25));
    }
    if (detected) {
      const { period, confidence } = detected.grid;
      const { r, g, b, transparent } = detected.background;
      const confiance = confidence > 0.25 ? 'bonne' : confidence > 0.1 ? 'moyenne' : 'faible';
      detectedInfo.innerHTML = '';
      detectedInfo.append(
        `Détecté : case de ${period.toFixed(2).replace('.', ',')} px (confiance ${confiance}) · fond `,
        swatch(transparent ? null : `rgb(${r}, ${g}, ${b})`),
        transparent ? ' transparent' : ` rvb(${r}, ${g}, ${b})`,
        settings.gridLocked ? ' · grille appliquée à tout le lot' : '',
      );
    } else {
      detectedInfo.textContent = '';
    }
  }

  watch(store, ['settings', 'detected', 'source'], render);
  render();
}

function swatch(color) {
  const s = document.createElement('span');
  s.className = 'mini-swatch' + (color ? '' : ' is-transparent');
  if (color) s.style.background = color;
  return s;
}
