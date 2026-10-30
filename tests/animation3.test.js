import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage } from '../src/core/image.js';
import { createRig, completeParts, composeFrame, BODY } from '../src/core/rig.js';
import { detectLimbs } from '../src/core/walk.js';
import { actionPoses, ACTIONS } from '../src/core/actions.js';
import { fillSmallHoles, polishFrame } from '../src/core/polish.js';
import { serializeProject, parseProject, gameSheet } from '../src/core/project.js';

const put = (img, x, y, c) => img.data.set([...c, 255], (y * img.width + x) * 4);
const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

/** Torse, deux bras, deux jambes (comme animation2.test.js), découpé. */
function figure() {
  const base = createImage(40, 40);
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(base, x, y, c); };
  fill(15, 8, 25, 24, [200, 200, 200]);
  fill(16, 24, 19, 36, [180, 130, 100]);
  fill(21, 24, 24, 36, [180, 130, 100]);
  fill(12, 10, 15, 22, [180, 130, 100]);
  fill(25, 10, 28, 22, [180, 130, 100]);
  const rig = createRig(40, 40);
  const add = (id, name, pivot) => { rig.parts.push({ id, name, pivot, parent: BODY, pivotSet: true }); rig.order.push(id); };
  add(1, 'Bras gauche', { x: 13.5, y: 10.5 });
  add(2, 'Bras droit', { x: 26.5, y: 10.5 });
  add(3, 'Cuisse gauche', { x: 17.5, y: 24.5 });
  add(4, 'Cuisse droite', { x: 22.5, y: 24.5 });
  const lab = (id, x, y) => { rig.labels[y * 40 + x] = id; };
  lab(1, 13, 15); lab(2, 26, 15); lab(3, 17, 30); lab(4, 22, 30);
  completeParts(base, rig);
  return { base, rig };
}

test('animations prêtes : chaque action donne des poses qui bougent bras et corps', () => {
  const { base, rig } = figure();
  const limbs = detectLimbs(base, rig);
  assert.ok(limbs && limbs.arms.length === 2 && limbs.legs.length === 2);
  for (const style of ['droite', 'gauche', 'face']) {
    for (const action of ACTIONS) {
      const poses = actionPoses(limbs, action, { style });
      assert.ok(poses.length >= 3, `${action} ${style} : ${poses.length} images`);
      for (const pose of poses) for (const v of Object.values(pose)) assert.ok(Number.isInteger(v.angle) && Number.isInteger(v.dx) && Number.isInteger(v.dy));
      // les images s'enchaînent sans planter
      for (const pose of poses) composeFrame(base, rig, pose);
    }
  }
  const attaque = actionPoses(limbs, 'attaque', { style: 'droite' });
  const gauche = actionPoses(limbs, 'attaque', { style: 'gauche' });
  // l'attaque projette le corps vers l'avant : vers la droite d'un côté, vers la gauche de l'autre
  assert.ok(attaque[2][BODY].dx > 0 && gauche[2][BODY].dx < 0);
  // le bras du côté du regard part vers l'avant (le bout du bras pendant vers la droite : angle négatif)
  assert.ok(attaque[2][2].angle < 0);
});

test('finition : pixels seuls et petits îlots retirés, petits trous bouchés, le vide autour reste vide', () => {
  const img = createImage(20, 20);
  for (let y = 4; y < 14; y++) for (let x = 4; x < 14; x++) put(img, x, y, [10, 20, 30]);
  img.data[(8 * 20 + 8) * 4 + 3] = 0;   // trou d'un pixel
  img.data[(8 * 20 + 9) * 4 + 3] = 0;   // … de deux
  put(img, 17, 17, [1, 2, 3]);           // pixel seul
  put(img, 1, 1, [1, 2, 3]); put(img, 2, 1, [1, 2, 3]);   // îlot de 2
  const out = polishFrame(img);
  assert.equal(alpha(out, 8, 8), 255);
  assert.equal(alpha(out, 9, 8), 255);
  assert.deepEqual([...out.data.slice((8 * 20 + 8) * 4, (8 * 20 + 8) * 4 + 3)], [10, 20, 30]);
  assert.equal(alpha(out, 17, 17), 0);
  assert.equal(alpha(out, 1, 1), 0);
  assert.equal(alpha(out, 0, 0), 0);
  // un grand trou n'est pas un trou à boucher
  const ring = createImage(20, 20);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) if (x < 5 || x > 14 || y < 5 || y > 14) put(ring, x, y, [5, 5, 5]);
  assert.equal(alpha(fillSmallHoles(ring), 10, 10), 0);
});

test('projet : aller-retour exact (sprite, découpage, animations, retouches)', () => {
  const { base, rig } = figure();
  const clips = {
    marche: [{ pose: { 1: { angle: 10, dx: 0, dy: 0 } }, edits: new Map([[5, [1, 2, 3, 255]]]) }, { pose: {}, edits: new Map() }],
    attaque: [{ pose: { [BODY]: { angle: 0, dx: 2, dy: 0 } }, edits: new Map() }],
  };
  const back = parseProject(serializeProject({ base, rig, clips, clip: 'marche', fps: 9, style: 'droite' }));
  assert.deepEqual([...back.base.data], [...base.data]);
  assert.deepEqual([...back.rig.labels], [...rig.labels]);
  assert.deepEqual(back.rig.parts.map((p) => [p.id, p.name, p.pivot.x, p.parent]), rig.parts.map((p) => [p.id, p.name, p.pivot.x, p.parent]));
  assert.deepEqual(back.rig.order, rig.order);
  assert.equal(back.clips.marche.length, 2);
  assert.deepEqual([...back.clips.marche[0].edits], [[5, [1, 2, 3, 255]]]);
  assert.equal(back.clips.attaque[0].pose[BODY].dx, 2);
  assert.equal(back.fps, 9);
  assert.equal(back.style, 'droite');
  assert.throws(() => parseProject('{"format":"autre"}'));
});

test('planche pour le jeu : une ligne par animation, même boîte pour toutes', () => {
  const a = createImage(10, 10), b = createImage(10, 10);
  put(a, 2, 2, [255, 0, 0]); put(b, 7, 8, [0, 255, 0]);
  const { image, meta } = gameSheet([
    { name: 'repos', images: [a], fps: 4 },
    { name: 'vide', images: [], fps: 4 },
    { name: 'marche', images: [a, b, b], fps: 10 },
  ]);
  assert.equal(meta.frameWidth, 6);
  assert.equal(meta.frameHeight, 7);
  assert.deepEqual(meta.animations.map((x) => [x.name, x.row, x.frames]), [['repos', 0, 1], ['marche', 1, 3]]);
  assert.equal(image.width, 18);
  assert.equal(image.height, 14);
  assert.equal(alpha(image, 0, 0), 255);                 // le rouge de `a` en haut à gauche
  assert.equal(alpha(image, 6 + 5, 7 + 6), 255);         // le vert de `b`, 2e image de la 2e ligne
});

test('variantes : chacune donne des poses entières, la glisse fait pousser une jambe puis l’autre', async () => {
  const { VARIANTES } = await import('../src/core/actions.js');
  const { base, rig } = figure();
  const limbs = detectLimbs(base, rig);
  for (const [action, list] of Object.entries(VARIANTES)) {
    for (const { key } of list) {
      for (const style of ['face', 'droite', 'gauche']) {
        const poses = actionPoses(limbs, action, { style, variante: key });
        assert.ok(poses.length >= 3, `${action}/${key}/${style}`);
        for (const pose of poses) for (const v of Object.values(pose)) assert.ok(Number.isInteger(v.angle) && Number.isInteger(v.dx) && Number.isInteger(v.dy));
      }
    }
  }
  const glisse = actionPoses(limbs, 'marche', { style: 'face', variante: 'glisse' });
  const [left, right] = limbs.legs.map((l) => l.parts[0]);
  const pushes = (id) => glisse.map((pose) => Math.abs(pose[id]?.angle ?? 0));
  // chaque jambe pousse à son tour : quand l'une pousse fort, l'autre est au repos
  const l = pushes(left), r = pushes(right);
  assert.ok(Math.max(...l) > 10 && Math.max(...r) > 10);
  for (let i = 0; i < l.length; i++) assert.ok(Math.min(l[i], r[i]) < 3, `image ${i} : ${l[i]} et ${r[i]}`);
});

test('déduire les articulations : deux cuisses placées et rattachées au corps restent sœurs', async () => {
  const { inferJoints } = await import('../src/core/rig.js');
  const base = createImage(20, 20);
  for (let y = 10; y < 20; y++) for (let x = 5; x < 15; x++) put(base, x, y, [0, 0, 200]);
  for (let y = 0; y < 10; y++) for (let x = 5; x < 15; x++) put(base, x, y, [200, 0, 0]);
  const rig = createRig(20, 20);
  rig.parts.push({ id: 1, name: 'Cuisse gauche', pivot: { x: 7.5, y: 10.5 }, parent: BODY, pivotSet: true });
  rig.parts.push({ id: 2, name: 'Cuisse droite', pivot: { x: 12.5, y: 10.5 }, parent: BODY, pivotSet: true });
  for (let y = 10; y < 20; y++) for (let x = 5; x < 15; x++) rig.labels[y * 20 + x] = x < 10 ? 1 : 2;
  inferJoints(base, rig);
  assert.equal(rig.parts.find((p) => p.id === 1).parent, BODY);
  assert.equal(rig.parts.find((p) => p.id === 2).parent, BODY);
});
