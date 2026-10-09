// Web Worker : le traitement lourd hors du fil principal.
//
// Messages reçus :
//   { type: 'analyze', id, image }   garde l'image, renvoie grille + fond détectés
//   { type: 'convert', id, options } convertit l'image gardée (options de pipeline.convert)
// Réponses : { type: 'analyzed' | 'converted' | 'error', id, ... }

import { analyze, convert } from '../core/pipeline.js';

let source = null;

self.onmessage = ({ data: msg }) => {
  try {
    if (msg.type === 'analyze') {
      source = msg.image;
      const { grid, background } = analyze(source);
      self.postMessage({ type: 'analyzed', id: msg.id, grid, background });
    } else if (msg.type === 'convert') {
      if (!source) throw new Error('Aucune image chargée.');
      const result = convert(source, msg.options);
      self.postMessage({ type: 'converted', id: msg.id, result }, [result.image.data.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message || String(err) });
  }
};
