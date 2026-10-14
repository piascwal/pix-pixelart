import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { zip, crc32, uniqueNames } from '../src/core/zip.js';
import { processWithSettings } from '../src/core/batch.js';
import { createImage } from '../src/core/image.js';

test('crc32 : valeur connue', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('noms uniques pour les doublons', () => {
  assert.deepEqual(uniqueNames(['a.png', 'b.png', 'a.png', 'a.png']), ['a.png', 'b.png', 'a-2.png', 'a-3.png']);
});

test('zip : relu par un décodeur indépendant (Python zipfile)', () => {
  const files = [
    { name: 'un.png', data: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: 'été/deux.png', data: new Uint8Array(1000).map((_, i) => i % 251) },
    { name: 'vide.png', data: new Uint8Array(0) },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const path = join(dir, 't.zip');
  writeFileSync(path, zip(files));
  const py = spawnSync('python3', ['-I', '-c', `
import zipfile, sys, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({n: list(z.read(n)[:5]) + [len(z.read(n))] for n in z.namelist()}, ensure_ascii=False))
`, path], { encoding: 'utf8' });
  assert.equal(py.status, 0, py.stderr);
  const got = JSON.parse(py.stdout);
  assert.deepEqual(got['un.png'], [1, 2, 3, 4, 5, 5]);
  assert.equal(got['été/deux.png'][5], 1000);
  assert.deepEqual(got['vide.png'], [0]);
});

test('lot : deux images aux grilles différentes traitées avec les mêmes réglages', () => {
  const sprite = (cell, n) => {
    const img = createImage(cell * n, cell * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const on = (x + y) % 3 !== 0;
      for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
        img.data.set(on ? [200 - x * 8, 40 + y * 8, 90, 255] : [255, 255, 255, 255], ((y * cell + dy) * img.width + x * cell + dx) * 4);
      }
    }
    return img;
  };
  const settings = { gridMode: 'detect', targetSize: 64, removeBg: true, tolerance: 60, colors: 16, paletteRules: { excluded: [], replace: {} }, cleanup: false, minIsland: 4 };
  const a = processWithSettings(sprite(6, 20), settings);
  const b = processWithSettings(sprite(9, 20), settings);
  assert.equal(a.image.width, 20);
  assert.equal(b.image.width, 20);
  const t = processWithSettings(sprite(6, 20), { ...settings, gridMode: 'target', targetSize: 10, removeBg: false });
  assert.equal(Math.max(t.image.width, t.image.height), 10);
});

test('lot : une grille réglée à la main s\'applique à toutes les images', () => {
  const img = createImage(120, 120);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) img.data.set([(x * 2) % 256, (y * 2) % 256, 128, 255], (y * 120 + x) * 4);
  const base = { gridMode: 'detect', targetSize: 64, removeBg: true, tolerance: 60, colors: 32, paletteRules: { excluded: [], replace: {} }, cleanup: false, minIsland: 4 };
  const locked = processWithSettings(img, { ...base, gridLocked: true, period: 10, offsetX: 0, offsetY: 0 });
  assert.equal(locked.image.width, 12);                  // 120 / 10 cases
  const other = processWithSettings(img, { ...base, gridLocked: true, period: 20, offsetX: 0, offsetY: 0 });
  assert.equal(other.image.width, 6);
});
