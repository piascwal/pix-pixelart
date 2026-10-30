// Entrée / sortie du mode Animation. Il travaille sur une copie du résultat
// (retouches comprises) ; la conversion reste intacte et on y revient par « Retour ».

import { watch } from '../state.js';
import { anim, start, stop, undoLast, redoLast, loadProject } from './animStore.js';
import { toast } from '../clipboard.js';
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

  // « Ouvrir un projet » : depuis l'accueil comme depuis le mode Animation
  for (const input of document.querySelectorAll('[data-open-project]')) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        loadProject(await file.text());
        mainStore.set({ sourceName: file.name.replace(/\.json$/i, '') });
        toast('Projet ouvert');
      } catch (e) {
        toast(e.message || 'Projet illisible');
      }
    });
  }

  watch(anim, ['active'], (s) => {
    document.body.classList.toggle('is-anim', s.active);
    section.hidden = !s.active;
    main.hidden = s.active;
    window.scrollTo(0, 0);
  });

  const view = createAnimView(document.querySelector('#anim-canvas'), document.querySelector('#anim-view'));
  document.querySelector('#anim-zoom-in').addEventListener('click', view.zoomIn);
  document.querySelector('#anim-zoom-out').addEventListener('click', view.zoomOut);
  document.querySelector('#anim-fit').addEventListener('click', view.fit);
  createAnimPanel(section, mainStore);

  window.addEventListener('keydown', (e) => {
    if (!anim.get().active || !(e.ctrlKey || e.metaKey) || e.target.closest?.('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoLast(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoLast(); }
  });
}
