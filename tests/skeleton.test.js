import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage } from '../src/core/image.js';
import { createRig, BODY } from '../src/core/rig.js';
import { HUMAN_PARTS, estimateJoints, skinFromSkeleton } from '../src/core/skeleton.js';
import { detectLimbs } from '../src/core/walk.js';

/** Bonhomme debout de 40 × 80 : tête, torse, bras le long du corps, deux jambes. */
function stick() {
  const img = createImage(40, 80);
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([200, 120, 60, 255], (y * 40 + x) * 4); };
  fill(16, 0, 24, 10);      // tête
  fill(12, 12, 28, 40);     // torse
  fill(7, 12, 12, 42);      // bras gauche
  fill(28, 12, 33, 42);     // bras droit
  fill(14, 40, 19, 78);     // jambe gauche
  fill(21, 40, 26, 78);     // jambe droite
  return img;
}

test('squelette humain : articulations estimées, symétriques et dans le bon ordre', () => {
  const J = estimateJoints(stick());
  for (const spec of HUMAN_PARTS) assert.ok(J[spec.joint], spec.joint);
  assert.ok(J.shoulderL.x < J.neck.x && J.neck.x < J.shoulderR.x);
  assert.ok(J.hipL.x < J.hipR.x && J.kneeL.x < J.kneeR.x);
  assert.ok(J.neck.y < J.shoulderL.y && J.shoulderL.y < J.elbowL.y && J.elbowL.y < J.wristL.y);
  assert.ok(J.hipL.y < J.kneeL.y && J.kneeL.y < J.ankleL.y);
});

test('découpe auto : chaque pixel de membre va à son os, le torse reste au corps', () => {
  const img = stick();
  const J = estimateJoints(img);
  const rig = createRig(40, 80);
  const ids = new Map();
  for (const spec of HUMAN_PARTS) {
    const id = rig.parts.length;
    rig.parts.push({ id, name: spec.name, pivot: { ...J[spec.joint] }, pivotSet: true, parent: BODY });
    rig.order.push(id);
    ids.set(spec.key, id);
  }
  for (const spec of HUMAN_PARTS) rig.parts.find((p) => p.id === ids.get(spec.key)).parent = spec.parent ? ids.get(spec.parent) : BODY;
  const auto = new Uint8Array(rig.labels.length);
  const n = skinFromSkeleton(img, rig, auto);
  assert.ok(n > 300);
  const label = (x, y) => rig.labels[y * 40 + x];
  assert.equal(label(20, 25), BODY);                                     // milieu du torse
  assert.notEqual(label(9, 30), BODY);                                   // bras gauche
  assert.notEqual(label(30, 30), BODY);                                  // bras droit
  assert.notEqual(label(16, 60), BODY);                                  // jambe gauche
  assert.notEqual(label(23, 60), BODY);                                  // jambe droite
  assert.notEqual(label(20, 4), BODY);                                   // tête
  assert.notEqual(label(16, 60), label(23, 60));                         // deux jambes distinctes
  // refaire le découpage repart du corps : même résultat
  const first = Uint8Array.from(rig.labels);
  skinFromSkeleton(img, rig, auto);
  assert.deepEqual(Uint8Array.from(rig.labels), first);
  // et la marche reconnaît bras et jambes
  const limbs = detectLimbs(img, rig);
  assert.ok(limbs && limbs.legs.length === 2 && limbs.arms.length === 2);
  assert.equal(limbs.legs[0].parts.length, 3);                           // cuisse, jambe, pied
});
