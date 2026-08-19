import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attemptSpin } from './store.js';

describe('attemptSpin', () => {
  it('decrements remaining through the shipped resolveSpin path', async () => {
    let prizes = [
      { id: 'a', name: 'A', share: 100, total: 2, remaining: 2 },
    ];
    const result = await attemptSpin(
      {
        load: async () => prizes,
        tryDecrement: async (id) => {
          const hit = prizes.find((p) => p.id === id && p.remaining > 0);
          if (!hit) return false;
          prizes = prizes.map((p) =>
            p.id === id ? { ...p, remaining: p.remaining - 1 } : p,
          );
          return true;
        },
      },
      () => 0.1,
    );
    assert.equal(result.ok, true);
    assert.equal(result.winnerId, 'a');
    assert.equal(result.prizes[0].remaining, 1);
  });

  it('returns no winner when all stock is 0', async () => {
    const result = await attemptSpin(
      {
        load: async () => [
          { id: 'a', name: 'A', share: 100, total: 1, remaining: 0 },
        ],
        tryDecrement: async () => {
          throw new Error('should not decrement');
        },
      },
      () => 0.5,
    );
    assert.equal(result.winnerId, null);
    assert.equal(result.ok, true);
  });

  it('retries when decrement loses the race, then fails busy', async () => {
    const result = await attemptSpin(
      {
        load: async () => [
          { id: 'a', name: 'A', share: 100, total: 1, remaining: 1 },
        ],
        tryDecrement: async () => false,
      },
      () => 0.1,
    );
    assert.equal(result.ok, false);
    assert.equal(result.busy, true);
  });
});
