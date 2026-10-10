// Icônes Lucide (licence ISC, voir assets/LICENSE-lucide.txt) : un fichier
// unique, assets/icons.svg, d'où l'on tire chaque icône par son nom.

const NS = 'http://www.w3.org/2000/svg';

export function icon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}
