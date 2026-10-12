// Entrée / sortie du mode Animation. Il travaille sur une copie du résultat
// (retouches comprises) ; la conversion reste intacte et on y revient par « Retour ».

import { watch } from '../state.js';
import { anim, start, stop, undoLast, redoLast } from './animStore.js';
import { createAnimView } from './animView.js';
import { createAnimPanel } from './animPanel.js';

export function setupAnimation(mainStore) {
  const section = document.querySelector('#anim');
  const main = document.querySelector('main.app');

  document.querySelector('#anim-enter').addEventListener('click', () => {
    const { edited } = mainStore.get();
    if (edited?.width) start(edited);
  });
  document.querySelector('#anim-exit').addEventListener('click', stop);

  watch(anim, ['active'], (s) => {
    document.body.classList.toggle('is-anim', s.active);
    section.hidden = !s.active;
    main.hidden = s.active;
    window.scrollTo(0, 0);
  });

  createAnimView(document.querySelector('#anim-canvas'), document.querySelector('#anim-view'));
  createAnimPanel(section, mainStore);

  window.addEventListener('keydown', (e) => {
    if (!anim.get().active || !(e.ctrlKey || e.metaKey) || e.target.closest?.('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoLast(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoLast(); }
  });
}
