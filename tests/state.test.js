import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, watch } from '../src/ui/state.js';

test('abonnement : reçoit le nouvel état et le précédent', () => {
  const store = createStore({ a: 1, b: 1 });
  const seen = [];
  store.subscribe((s, prev) => seen.push([prev.a, s.a]));
  store.set({ a: 2 });
  store.set((s) => ({ a: s.a + 1 }));
  assert.deepEqual(seen, [[1, 2], [2, 3]]);
});

test('modification pendant une notification : les autres abonnés voient l’état final', () => {
  const store = createStore({ result: 0, edited: 0 });
  watch(store, ['result'], (s) => store.set({ edited: s.result * 10 }));
  const edits = [];
  watch(store, ['edited'], (s) => edits.push(s.edited));
  store.set({ result: 4 });
  assert.deepEqual(edits, [40]);
});

test('désabonnement', () => {
  const store = createStore({ a: 0 });
  let n = 0;
  const off = store.subscribe(() => n++);
  store.set({ a: 1 });
  off();
  store.set({ a: 2 });
  assert.equal(n, 1);
});
