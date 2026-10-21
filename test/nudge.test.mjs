import test from 'node:test';
import assert from 'node:assert/strict';
import { createNudger } from '../src/js/nudger.js';
import { clean, load, save, KEY } from '../src/js/prefs.js';

const M = 60_000;

test('nudges after the chosen minutes of distraction', () => {
  const n = createNudger();
  let fired = null;
  for (let t = 0; t <= 20 * M; t += 2000) if (n.update(t, true, 15) && fired === null) fired = t;
  assert.equal(fired, 15 * M);
});

test('a short hop away does not reset, real work does', () => {
  const n = createNudger();
  n.update(0, true, 10);
  n.update(5 * M, true, 10);
  n.update(5 * M + 20_000, false, 10);
  assert.ok(n.stretch(5 * M + 30_000) > 5 * M);
  n.update(7 * M, false, 10);
  assert.equal(n.stretch(7 * M), 0);
});

test('snooze waits, back to work starts over, 0 means never', () => {
  const n = createNudger();
  for (let t = 0; t <= 10 * M; t += 2000) n.update(t, true, 10);
  n.snooze(10 * M, 5);
  assert.equal(n.update(12 * M, true, 10), false);
  assert.equal(n.update(15 * M, true, 10), true);
  n.reset(15 * M, 1);
  assert.equal(n.update(16 * M, true, 10), false);
  assert.equal(createNudger().update(99 * M, true, 0), false);
});

test('prefs are cleaned and saved', () => {
  const m = new Map();
  const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(load(store).nudgeAfter, 15);
  save({ nudgeAfter: 7, idleMinutes: 500, overrides: { YouTube: 'learning', bad: 3 } }, store);
  const p = load(store);
  assert.equal(p.nudgeAfter, 15);
  assert.equal(p.idleMinutes, 60);
  assert.deepEqual(p.overrides, { YouTube: 'learning' });
  assert.ok(m.has(KEY));
  assert.equal(clean({ titles: false }).titles, false);
});
