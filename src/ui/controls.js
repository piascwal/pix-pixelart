// Panneau de réglages : grille (taille, décalages), palette, fond, nettoyage.
// Chaque réglage = un curseur couplé à un champ numérique (précis sur mobile).

import { watch } from './state.js';

const fmt = (v, step) => (step < 1 ? Number(v).toFixed(String(step).split('.')[1].length) : String(Math.round(v)));

/**
 * Relie un curseur + champ numérique à settings[key].
 * Le HTML porte : <input type="range" data-setting="key"> et <input type="number" data-setting="key">
 */
function bindNumber(root, store, key) {
  const inputs = root.querySelectorAll(`[data-setting="${key}"]`);
  const commit = (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    store.set((s) => ({ settings: { ...s.settings, [key]: v } }));
  };
  for (const input of inputs) {
    input.addEventListener('input', () => commit(input.value));
  }
  return (settings) => {
    for (const input of inputs) {
      if (document.activeElement === input && input.type === 'number') continue;
      input.value = fmt(settings[key], Number(input.step) || 1);
    }
  };
}

export function createControls(root, store) {
  const updaters = ['period', 'offsetX', 'offsetY', 'colors', 'tolerance', 'minIsland']
    .map((key) => bindNumber(root, store, key));

  const cleanup = root.querySelector('[data-setting="cleanup"]');
  cleanup.addEventListener('change', () =>
    store.set((s) => ({ settings: { ...s.settings, cleanup: cleanup.checked } })));

  const outputs = root.querySelectorAll('[name="output"]');
  for (const radio of outputs) {
    radio.addEventListener('change', () =>
      store.set((s) => ({ settings: { ...s.settings, output: radio.value } })));
  }

  root.querySelector('[data-action="auto-grid"]').addEventListener('click', () => {
    const { detected } = store.get();
    if (!detected) return;
    const { period, offsetX, offsetY } = detected.grid;
    store.set((s) => ({ settings: { ...s.settings, period, offsetX, offsetY } }));
  });

  const detectedInfo = root.querySelector('[data-info="detected"]');
  const islandRow = root.querySelector('[data-row="minIsland"]');

  function render() {
    const { settings, detected } = store.get();
    for (const u of updaters) u(settings);
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
      );
    } else {
      detectedInfo.textContent = '';
    }
  }

  watch(store, ['settings', 'detected'], render);
  render();
}

function swatch(color) {
  const s = document.createElement('span');
  s.className = 'mini-swatch' + (color ? '' : ' is-transparent');
  if (color) s.style.background = color;
  return s;
}
