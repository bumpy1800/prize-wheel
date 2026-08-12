/**
 * Unit tests for shipped wheel-logic.js (not a re-implementation).
 * Run: node --test wheel-logic.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickWinner,
  applyWin,
  resolveSpin,
  segmentLayout,
  normalizePrizes,
  defaultPrizes,
} from './wheel-logic.js';

const sample = () => [
  { id: 'a', name: 'A', share: 50, total: 10, remaining: 10 },
  { id: 'b', name: 'B', share: 30, total: 5, remaining: 5 },
  { id: 'c', name: 'C', share: 20, total: 3, remaining: 3 },
];

describe('pickWinner', () => {
  it('only returns configured prize ids when all stock > 0', () => {
    const prizes = sample();
    const ids = new Set(prizes.map((p) => p.id));
    for (let i = 0; i < 200; i++) {
      const id = pickWinner(prizes, () => (i + 0.5) / 200);
      assert.ok(ids.has(id), `unexpected id ${id}`);
    }
  });

  it('respects relative shares with deterministic rng buckets', () => {
    const prizes = sample();
    // total share 100: [0,50)=a, [50,80)=b, [80,100)=c
    assert.equal(pickWinner(prizes, () => 0.0), 'a');
    assert.equal(pickWinner(prizes, () => 0.49), 'a');
    assert.equal(pickWinner(prizes, () => 0.5), 'b');
    assert.equal(pickWinner(prizes, () => 0.79), 'b');
    assert.equal(pickWinner(prizes, () => 0.8), 'c');
    assert.equal(pickWinner(prizes, () => 0.999), 'c');
  });

  it('never returns a prize with stock 0 while others remain', () => {
    const prizes = [
      { id: 'a', name: 'A', share: 90, total: 10, remaining: 0 },
      { id: 'b', name: 'B', share: 10, total: 5, remaining: 5 },
    ];
    for (let i = 0; i < 300; i++) {
      const id = pickWinner(prizes, () => i / 300);
      assert.equal(id, 'b');
    }
  });

  it('renormalizes shares over eligible only', () => {
    const prizes = [
      { id: 'sold', name: 'Sold', share: 99, total: 1, remaining: 0 },
      { id: 'left', name: 'Left', share: 1, total: 2, remaining: 2 },
    ];
    assert.equal(pickWinner(prizes, () => 0.0), 'left');
    assert.equal(pickWinner(prizes, () => 0.99), 'left');
  });

  it('always returns the only prize with stock left', () => {
    const prizes = [
      { id: 'a', name: 'A', share: 10, total: 1, remaining: 0 },
      { id: 'b', name: 'B', share: 20, total: 1, remaining: 1 },
      { id: 'c', name: 'C', share: 70, total: 1, remaining: 0 },
    ];
    for (let i = 0; i < 50; i++) {
      assert.equal(pickWinner(prizes, () => Math.random()), 'b');
    }
  });

  it('returns null safely when all stock is 0', () => {
    const prizes = sample().map((p) => ({ ...p, remaining: 0 }));
    assert.equal(pickWinner(prizes, () => 0.5), null);
  });

  it('returns null for empty list', () => {
    assert.equal(pickWinner([], () => 0.5), null);
  });

  it('skips zero-share prizes even with stock', () => {
    const prizes = [
      { id: 'zero', name: 'Z', share: 0, total: 5, remaining: 5 },
      { id: 'ok', name: 'O', share: 100, total: 5, remaining: 5 },
    ];
    assert.equal(pickWinner(prizes, () => 0.5), 'ok');
  });
});

describe('applyWin', () => {
  it('decrements remaining by 1 for the won prize', () => {
    const prizes = sample();
    const next = applyWin(prizes, 'b');
    assert.equal(next.find((p) => p.id === 'b').remaining, 4);
    assert.equal(next.find((p) => p.id === 'a').remaining, 10);
    // immutability
    assert.equal(prizes.find((p) => p.id === 'b').remaining, 5);
  });

  it('floors remaining at 0', () => {
    const prizes = [{ id: 'a', name: 'A', share: 100, total: 1, remaining: 0 }];
    const next = applyWin(prizes, 'a');
    assert.equal(next[0].remaining, 0);
  });
});

describe('resolveSpin', () => {
  it('picks and decrements in one call', () => {
    const prizes = sample();
    const result = resolveSpin(prizes, () => 0.1); // 'a'
    assert.equal(result.winnerId, 'a');
    assert.equal(result.prizes.find((p) => p.id === 'a').remaining, 9);
    assert.ok(result.winner);
    assert.equal(result.winner.name, 'A');
  });

  it('returns null winner when nothing left', () => {
    const prizes = sample().map((p) => ({ ...p, remaining: 0 }));
    const result = resolveSpin(prizes, () => 0.5);
    assert.equal(result.winnerId, null);
    assert.equal(result.winner, null);
  });
});

describe('segmentLayout', () => {
  it('keeps visual segments for stock-0 prizes', () => {
    const prizes = [
      { id: 'a', name: 'A', share: 50, total: 1, remaining: 0, color: '#111' },
      { id: 'b', name: 'B', share: 50, total: 1, remaining: 5, color: '#222' },
    ];
    const segs = segmentLayout(prizes);
    assert.equal(segs.length, 2);
    assert.equal(segs[0].remaining, 0);
    assert.equal(segs[0].endDeg - segs[0].startDeg, 180);
    assert.equal(segs[1].endDeg - segs[1].startDeg, 180);
  });
});

describe('normalizePrizes', () => {
  it('clamps remaining to total and fills defaults', () => {
    const n = normalizePrizes([{ name: 'X', share: 10, total: 3, remaining: 99 }]);
    assert.equal(n[0].remaining, 3);
    assert.equal(n[0].name, 'X');
    assert.ok(n[0].id);
  });

  it('falls back to defaultPrizes on bad input', () => {
    const d = defaultPrizes();
    assert.ok(d.length >= 1);
    assert.equal(normalizePrizes(null).length, d.length);
  });
});
