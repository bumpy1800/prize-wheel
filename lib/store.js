import { defaultPrizes, normalizePrizes, resolveSpin } from '../wheel-logic.js';
import { getCollection } from './mongo.js';

export const CONFIG_ID = 'default';

const emptyConfig = () => ({
  _id: CONFIG_ID,
  prizes: defaultPrizes(),
  updatedAt: new Date(),
});

/**
 * Load-modify-save spin with a compare-and-decrement hook.
 * tryDecrement(winnerId) → true if remaining was decremented.
 */
export const attemptSpin = async ({ load, tryDecrement }, rng = Math.random) => {
  for (let i = 0; i < 3; i++) {
    const prizes = normalizePrizes(await load());
    const result = resolveSpin(prizes, rng);
    if (result.winnerId == null) {
      return { ok: true, winnerId: null, winner: null, prizes };
    }
    const saved = await tryDecrement(result.winnerId);
    if (saved) {
      const next = normalizePrizes(await load());
      const winner = next.find((p) => p.id === result.winnerId) ?? null;
      return { ok: true, winnerId: result.winnerId, winner, prizes: next };
    }
  }
  return { ok: false, busy: true, winnerId: null, winner: null, prizes: [] };
};

export const getConfig = async () => {
  const col = await getCollection();
  const existing = await col.findOne({ _id: CONFIG_ID });
  if (existing) {
    return {
      _id: CONFIG_ID,
      prizes: normalizePrizes(existing.prizes),
      updatedAt: existing.updatedAt ?? new Date(),
    };
  }
  const created = emptyConfig();
  await col.insertOne(created);
  return created;
};

export const replacePrizes = async (rawPrizes) => {
  const prizes = normalizePrizes(rawPrizes);
  if (prizes.length === 0) throw new Error('경품이 하나 이상 필요합니다.');
  const shareSum = prizes.reduce((s, p) => s + p.share, 0);
  if (!(shareSum > 0)) throw new Error('비중(%) 합이 0보다 커야 합니다.');

  const col = await getCollection();
  const updatedAt = new Date();
  await col.updateOne(
    { _id: CONFIG_ID },
    { $set: { prizes, updatedAt } },
    { upsert: true },
  );
  return { _id: CONFIG_ID, prizes, updatedAt };
};

export const spinAndSave = async (rng = Math.random) => {
  const col = await getCollection();
  return attemptSpin(
    {
      load: async () => {
        const doc = await getConfig();
        return doc.prizes;
      },
      tryDecrement: async (winnerId) => {
        const upd = await col.updateOne(
          {
            _id: CONFIG_ID,
            prizes: { $elemMatch: { id: winnerId, remaining: { $gt: 0 } } },
          },
          {
            $inc: { 'prizes.$.remaining': -1 },
            $set: { updatedAt: new Date() },
          },
        );
        return upd.modifiedCount === 1;
      },
    },
    rng,
  );
};

export const jsonConfig = (doc) => ({
  prizes: doc.prizes,
  updatedAt: doc.updatedAt,
});
