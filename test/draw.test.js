import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawAssignments } from '../lib/draw.js';

const names = (n) => Array.from({ length: n }, (_, i) => `p${i}`);

function assertValid(ids, couples, result) {
  assert.ok(result, 'a draw exists');
  assert.deepEqual(Object.keys(result).sort(), [...ids].sort(), 'everyone gives exactly once');
  assert.deepEqual(Object.values(result).sort(), [...ids].sort(), 'everyone receives exactly once');
  for (const [giver, receiver] of Object.entries(result)) {
    assert.notEqual(giver, receiver, 'nobody draws themselves');
    for (const [a, b] of couples) {
      assert.ok(!(giver === a && receiver === b) && !(giver === b && receiver === a), `${giver} must not draw partner ${receiver}`);
    }
  }
}

test('couples never draw each other across many random draws', () => {
  for (let n = 4; n <= 14; n++) {
    const ids = names(n);
    const couples = [];
    for (let i = 0; i + 1 < n; i += 2) couples.push([ids[i], ids[i + 1]]);
    for (let round = 0; round < 300; round++) assertValid(ids, couples, drawAssignments(ids, couples));
  }
});

test('works with no couples', () => {
  const ids = names(3);
  for (let round = 0; round < 100; round++) assertValid(ids, [], drawAssignments(ids));
});

test('returns null when the rules leave no valid draw', () => {
  assert.equal(drawAssignments(['a', 'b'], [['a', 'b']]), null);
  assert.equal(drawAssignments(['a', 'b', 'c'], [['a', 'b']]), null);
  assert.equal(drawAssignments(['a'], []), null);
});

test('every allowed recipient actually shows up over many draws', () => {
  const ids = names(5);
  const couples = [['p0', 'p1']];
  const seen = new Set();
  for (let round = 0; round < 2000; round++) {
    const result = drawAssignments(ids, couples);
    seen.add(`p0>${result.p0}`);
  }
  assert.deepEqual([...seen].sort(), ['p0>p2', 'p0>p3', 'p0>p4']);
});

test('every valid draw is equally likely', () => {
  const ids = names(6);
  const couples = [['p0', 'p1'], ['p2', 'p3']];
  const counts = new Map();
  const runs = 100_000;
  for (let round = 0; round < runs; round++) {
    const result = drawAssignments(ids, couples);
    const key = ids.map((id) => result[id]).join();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 116, 'all 116 valid draws show up');
  const expected = runs / counts.size;
  for (const count of counts.values()) {
    assert.ok(Math.abs(count / expected - 1) < 0.2, `a draw came up ${(count / expected).toFixed(2)}x as often as fair`);
  }
});
