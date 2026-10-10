// Infobulles : tout élément portant data-tip dit ce qu'il fait.
//  - écran tactile : appui long (le clic qui suit est annulé, rien n'est déclenché) ;
//  - souris : survol.
// Les icônes (gomme, pipette…) gardent leur aria-label pour les lecteurs d'écran.

const LONG_PRESS_MS = 450;
const HOVER_MS = 350;

export function setupTooltips() {
  const bubble = document.createElement('div');
  bubble.className = 'tooltip';
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;
  document.body.append(bubble);

  let pressTimer = 0;
  let hoverTimer = 0;
  let hideTimer = 0;
  let swallowClick = false;

  function show(el) {
    bubble.textContent = el.dataset.tip;
    bubble.hidden = false;
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const left = Math.min(window.innerWidth - b.width - 8, Math.max(8, r.left + r.width / 2 - b.width / 2));
    // au-dessus de l'élément (le doigt le cache), sinon en dessous
    const top = r.top - b.height - 10 >= 8 ? r.top - b.height - 10 : r.bottom + 10;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  const hide = () => { clearTimeout(hideTimer); bubble.hidden = true; };

  document.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    clearTimeout(pressTimer);
    const el = e.target.closest?.('[data-tip]');
    if (!el) { hide(); return; }
    if (e.pointerType === 'mouse') { hide(); return; }
    pressTimer = setTimeout(() => {
      swallowClick = true;
      show(el);
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  });

  const release = () => {
    clearTimeout(pressTimer);
    if (swallowClick) hideTimer = setTimeout(hide, 1800);
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('scroll', hide, true);

  // l'appui long ne doit pas activer le bouton
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // menu contextuel du navigateur sur appui long : inutile ici
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('[data-tip]') && e.pointerType !== 'mouse') e.preventDefault();
  });

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest?.('[data-tip]');
    clearTimeout(hoverTimer);
    if (el) hoverTimer = setTimeout(() => show(el), HOVER_MS);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    hide();
  });
}
