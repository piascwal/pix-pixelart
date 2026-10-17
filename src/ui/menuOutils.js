// Menu des outils sous le doigt : un appui long sur l'image l'ouvre (téléphone), pour changer d'outil sans
// remonter la page jusqu'à la barre d'outils. Il reprend les boutons de la barre (mêmes icônes, mêmes outils
// disponibles), plus annuler / rétablir.

import { icon } from './icons.js';

const MARGE = 8;

/** @returns {{ ouvre: (x: number, y: number) => void, ferme: () => void }} */
export function createToolMenu(store) {
  const menu = document.createElement('div');
  menu.className = 'tool-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Outils');
  menu.hidden = true;
  document.body.append(menu);

  /** Le nom court d'un outil : « Main : déplacer l'image » → « Main ». */
  const nom = (btn) => (btn.getAttribute('aria-label') || '').split(':')[0].trim();

  function item(libelle, nomIcone, { actif = false, desactive = false, action }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-pressed', String(actif));
    b.disabled = desactive;
    b.append(icon(nomIcone), document.createTextNode(libelle));
    b.addEventListener('click', () => {
      ferme();
      action();
    });
    return b;
  }

  /** L'identifiant de l'icône d'un bouton de la barre (le <use> de son SVG). */
  const iconeDe = (btn) => btn.querySelector('use')?.getAttribute('href')?.split('#')[1] ?? 'x';

  function ouvre(x, y) {
    const { tool } = store.get();
    menu.replaceChildren();
    for (const btn of document.querySelectorAll('#stage button[data-tool]')) {
      const outil = btn.dataset.tool;
      menu.append(
        item(nom(btn), iconeDe(btn), {
          actif: outil === tool,
          desactive: btn.disabled,
          action: () => store.set({ tool: outil }),
        }),
      );
    }
    menu.append(
      item('Aucun', 'x', { actif: tool === 'none', action: () => store.set({ tool: 'none' }) }),
    );
    for (const id of ['undo', 'redo']) {
      const btn = document.getElementById(id);
      if (btn) menu.append(item(nom(btn), iconeDe(btn), { desactive: btn.disabled, action: () => btn.click() }));
    }
    menu.hidden = false;
    // au-dessus du doigt s'il y a la place, sinon dessous ; toujours entièrement visible
    const { width, height } = menu.getBoundingClientRect();
    const gauche = Math.min(Math.max(MARGE, x - width / 2), window.innerWidth - width - MARGE);
    const haut = y - height - 24 >= MARGE ? y - height - 24 : Math.min(y + 24, window.innerHeight - height - MARGE);
    menu.style.left = `${gauche}px`;
    menu.style.top = `${Math.max(MARGE, haut)}px`;
    // un toucher ailleurs, Échap, un défilement ou un redimensionnement le referme
    setTimeout(() => {
      document.addEventListener('pointerdown', dehors, true);
      window.addEventListener('keydown', echap);
      window.addEventListener('scroll', ferme, { passive: true });
      window.addEventListener('resize', ferme);
    });
  }

  const dehors = (e) => {
    if (!menu.contains(e.target)) ferme();
  };
  const echap = (e) => {
    if (e.key === 'Escape') ferme();
  };

  function ferme() {
    if (menu.hidden) return;
    menu.hidden = true;
    document.removeEventListener('pointerdown', dehors, true);
    window.removeEventListener('keydown', echap);
    window.removeEventListener('scroll', ferme);
    window.removeEventListener('resize', ferme);
  }

  return { ouvre, ferme };
}
