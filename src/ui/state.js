// État central de l'interface, avec abonnement aux changements.
// Chaque module UI lit l'état, s'abonne, et ne modifie que via set().

export function createStore(initial) {
  let state = initial;
  // chaque abonné retient le dernier état qu'il a vu : si un abonné modifie
  // l'état pendant une notification, les suivants reçoivent l'état à jour,
  // une seule fois, avec le bon « avant ».
  const listeners = new Map();

  function notify() {
    for (const [fn, seen] of listeners) {
      if (seen === state || !listeners.has(fn)) continue;
      const now = state;
      listeners.set(fn, now);
      fn(now, seen);
    }
  }

  return {
    get: () => state,
    /** patch : objet fusionné à la racine, ou fonction (state) => patch */
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      notify();
    },
    /** fn(state, prev) ; renvoie la fonction de désabonnement */
    subscribe(fn) {
      listeners.set(fn, state);
      return () => listeners.delete(fn);
    },
  };
}

/** Raccourci : réagir seulement quand certaines clés changent. */
export function watch(store, keys, fn) {
  return store.subscribe((state, prev) => {
    if (keys.some((k) => state[k] !== prev[k])) fn(state, prev);
  });
}

export const DEFAULT_SETTINGS = Object.freeze({
  period: 8,
  offsetX: 0,
  offsetY: 0,
  colors: 48,
  tolerance: 60,
  cleanup: true,
  minIsland: 4,
  output: 'transparent', // ou 'magenta'
});

export const store = createStore({
  source: null,        // image source { width, height, data }
  sourceName: '',
  sourceBitmap: null,  // la même, prête à dessiner (canvas)
  detected: null,      // { grid, background } trouvés automatiquement
  settings: { ...DEFAULT_SETTINGS },
  busy: false,
  error: '',
  result: null,        // { image, palette, lines, stats } sortie de la conversion
  edited: null,        // image du résultat après retouches (ce qu'on affiche et exporte)
  editVersion: 0,      // incrémenté à chaque retouche
  history: { undo: 0, redo: 0 },
  tool: 'move',        // move | pencil | eraser | picker
  color: null,         // [r, g, b] couleur du crayon
  view: { mode: 'side', grid: true },
});
