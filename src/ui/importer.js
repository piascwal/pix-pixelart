// Import d'image : glisser-déposer, bouton, coller. Tout reste dans le navigateur.

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_PIXELS = 24e6;
const MAX_BATCH = 60;

/** Décode un fichier image en { image: {width,height,data}, bitmap: canvas }. */
export async function decodeImage(blob) {
  const bmp = await createImageBitmap(blob);
  if (bmp.width * bmp.height > MAX_PIXELS) {
    bmp.close?.();
    throw new Error(`Image trop grande (${bmp.width}×${bmp.height}). Maximum ~24 mégapixels.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { image: { width: canvas.width, height: canvas.height, data }, bitmap: canvas };
}

/**
 * @param {{ dropTarget: HTMLElement, fileInput: HTMLInputElement, onImage: Function, onError: Function }} opts
 *   onImage({ image, bitmap, name }) ; onBatch([{ image, bitmap, name }…]) quand plusieurs images arrivent d'un coup
 */
export function setupImporter({ dropTarget, fileInput, onImage, onBatch, onError }) {
  async function load(file, name) {
    if (!file) return;
    if (file.type && !ACCEPTED.includes(file.type)) {
      onError(`Format non pris en charge (${file.type}). Utilisez PNG, JPG ou WebP.`);
      return;
    }
    try {
      const decoded = await decodeImage(file);
      onImage({ ...decoded, name: name || file.name || 'image' });
    } catch (err) {
      onError(err.message || 'Impossible de lire cette image.');
    }
  }

  /** Une image : comme avant. Plusieurs : un lot, dans l'ordre. */
  async function loadMany(files) {
    const list = [...files].slice(0, MAX_BATCH);
    if (list.length <= 1 || !onBatch) return load(list[0]);
    const items = [];
    for (const file of list) {
      if (file.type && !ACCEPTED.includes(file.type)) continue;
      try {
        items.push({ ...(await decodeImage(file)), name: file.name || 'image' });
      } catch (err) {
        onError(`${file.name} : ${err.message || 'image illisible'}`);
      }
    }
    if (items.length === 1) onImage(items[0]);
    else if (items.length) onBatch(items);
  }

  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    loadMany(files);
  });

  // glisser-déposer n'importe où sur la page
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    depth++;
    dropTarget.classList.add('is-dragging');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) dropTarget.classList.remove('is-dragging');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropTarget.classList.remove('is-dragging');
    if (e.dataTransfer?.files?.length) loadMany(e.dataTransfer.files);
  });

  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    load(item.getAsFile(), 'image-collee');
  });
}
