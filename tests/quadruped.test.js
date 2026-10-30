import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage } from '../src/core/image.js';
import { createRig, composeFrame, BODY } from '../src/core/rig.js';
import { QUAD_PARTS, estimateQuadJoints, isQuadruped, quadFacing, quadPoses } from '../src/core/quadruped.js';
import { geodesicSkin } from '../src/core/geoskin.js';
import { jointLabel } from '../src/core/skeleton.js';

const put = (img, x, y, c) => img.data.set([...c, 255], (y * img.width + x) * 4);
const fill = (img, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(img, x, y, c); };

/** Un quadrupède de profil tourné vers la droite : corps, quatre pattes, cou et tête en haut à droite, queue à gauche. */
function animal(mirror = false) {
  const img = createImage(80, 60);
  const F = (x0, y0, x1, y1, c) => (mirror ? fill(img, 80 - x1, y0, 80 - x0, y1, c) : fill(img, x0, y0, x1, y1, c));
  F(12, 20, 62, 38, [140, 100, 60]);   // le corps
  for (const x of [14, 24, 48, 56]) F(x, 38, x + 4, 58, [90, 60, 40]);   // les pattes
  F(56, 6, 64, 20, [150, 110, 70]);    // le cou
  F(58, 2, 74, 12, [160, 120, 80]);    // la tête
  F(6, 18, 12, 24, [200, 180, 160]);   // la queue
  return img;
}

function riggé(img) {
  const rig = createRig(img.width, img.height);
  const { joints } = estimateQuadJoints(img);
  const ids = new Map();
  for (const s of QUAD_PARTS) { const id = rig.parts.length; rig.parts.push({ id, name: s.name, pivot: { ...joints[s.joint] }, parent: BODY, pivotSet: true }); rig.order.push(id); ids.set(s.key, id); }
  for (const s of QUAD_PARTS) rig.parts.find((p) => p.id === ids.get(s.key)).parent = s.parent ? ids.get(s.parent) : BODY;
  return { rig, ids, joints };
}

test('quadrupède : regard, quatre pattes, cou et queue lus sur la silhouette', () => {
  for (const mirror of [false, true]) {
    const img = animal(mirror);
    const { joints: J, facing } = estimateQuadJoints(img);
    assert.equal(facing, mirror ? -1 : 1);
    const xs = ['hipBN', 'hipBF', 'shoulderFN', 'shoulderFF'].map((k) => J[k].x);
    const want = mirror ? [64, 54, 30, 22] : [16, 26, 50, 58];
    xs.forEach((x, i) => assert.ok(Math.abs(x - want[i]) <= 1.5, `patte ${i} : ${x} au lieu de ${want[i]}`));
    for (const k of ['hipBN', 'shoulderFF']) assert.ok(J[k].y > 30 && J[k].y < 40, `${k} au niveau du ventre : ${J[k].y}`);
    assert.ok(mirror ? J.neck.x < 30 : J.neck.x > 50, `cou côté tête : ${J.neck.x}`);
    assert.ok(mirror ? J.tail.x > 66 : J.tail.x < 14, `queue côté croupe : ${J.tail.x}`);
    assert.ok(J.neck.y > 15 && J.neck.y < 30, `cou sur le dos, pas en l'air : ${J.neck.y}`);
  }
});

test('quadrupède : la découpe sépare les quatre pattes, le pas avance en diagonale', () => {
  const img = animal();
  const { rig, ids } = riggé(img);
  geodesicSkin(img, rig);
  assert.ok(isQuadruped(rig));
  assert.equal(quadFacing(rig), 1);
  const at = (x, y) => rig.labels[y * img.width + x];
  const legs = [16, 26, 50, 58].map((x) => at(x, 50));
  assert.equal(new Set(legs).size, 4, `quatre pattes distinctes : ${legs}`);
  assert.equal(at(36, 28), BODY, 'le milieu du corps reste au corps');
  for (const n of [4, 6, 8]) {
    const poses = quadPoses(rig, 'marche', img.height, { frames: n });
    assert.equal(poses.length, n);
    for (const pose of poses) composeFrame(img, rig, pose);
    // les paires diagonales bougent ensemble : avant proche avec arrière loin
    const fn = ids.get('thighFN'), bf = ids.get('thighBF'), ff = ids.get('thighFF');
    for (const pose of poses) {
      assert.equal(Math.sign(pose[fn].angle), Math.sign(pose[bf].angle));
      if (pose[fn].angle) assert.equal(Math.sign(pose[fn].angle), -Math.sign(pose[ff].angle));
    }
  }
  for (const action of ['repos', 'attaque', 'touche']) assert.ok(quadPoses(rig, action, img.height).length >= 3);
  assert.equal(quadPoses(rig, 'attaque', img.height, { frames: 4 }).length, 4);
  assert.equal(jointLabel('Jambe arrière loin'), 'Jarret arrière loin');
});
