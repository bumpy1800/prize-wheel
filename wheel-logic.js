/**
 * Pure prize-wheel selection & stock helpers.
 * Works in both browser and Node (ESM).
 */

/** @typedef {{ id: string, name: string, share: number, total: number, remaining: number, color?: string }} Prize */

/**
 * Pick a winner id among prizes with remaining > 0, weighted by share.
 * Shares are renormalized over eligible prizes only.
 * @param {Prize[]} prizes
 * @param {() => number} [rng] returns [0, 1)
 * @returns {string | null} prize id, or null if none eligible
 */
export const pickWinner = (prizes, rng = Math.random) => {
  if (!Array.isArray(prizes) || prizes.length === 0) return null;

  const eligible = prizes.filter((p) => Number(p.remaining) > 0 && Number(p.share) > 0);
  if (eligible.length === 0) return null;

  const totalShare = eligible.reduce((sum, p) => sum + Number(p.share), 0);
  if (!(totalShare > 0)) return null;

  let r = rng() * totalShare;
  for (const p of eligible) {
    r -= Number(p.share);
    if (r < 0 || Object.is(r, -0)) return p.id;
  }
  // Floating-point edge: land on last eligible
  return eligible.at(-1).id;
};

/**
 * Decrement remaining stock for the won prize (floor 0). Does not mutate input.
 * @param {Prize[]} prizes
 * @param {string} prizeId
 * @returns {Prize[]}
 */
export const applyWin = (prizes, prizeId) => {
  if (!Array.isArray(prizes)) return [];
  return prizes.map((p) => {
    if (p.id !== prizeId) return { ...p };
    const remaining = Math.max(0, Number(p.remaining) - 1);
    return { ...p, remaining };
  });
};

/**
 * Resolve a full spin: pick winner then apply stock decrement.
 * @param {Prize[]} prizes
 * @param {() => number} [rng]
 * @returns {{ winnerId: string | null, prizes: Prize[], winner: Prize | null }}
 */
export const resolveSpin = (prizes, rng = Math.random) => {
  const winnerId = pickWinner(prizes, rng);
  if (winnerId == null) {
    return { winnerId: null, prizes: prizes.map((p) => ({ ...p })), winner: null };
  }
  const next = applyWin(prizes, winnerId);
  const winner = next.find((p) => p.id === winnerId) ?? null;
  // winner after decrement still has the same identity/name; expose pre-decrement view for UI
  const winnerBefore = prizes.find((p) => p.id === winnerId) ?? null;
  return {
    winnerId,
    prizes: next,
    winner: winnerBefore ? { ...winnerBefore, remaining: Math.max(0, Number(winnerBefore.remaining) - 1) } : winner,
  };
};

/**
 * Segment angles for drawing (full 360° based on share of ALL prizes, including stock 0).
 * @param {Prize[]} prizes
 * @returns {{ id: string, name: string, startDeg: number, endDeg: number, midDeg: number, share: number, remaining: number, color: string }[]}
 */
export const segmentLayout = (prizes) => {
  const list = Array.isArray(prizes) ? prizes : [];
  const totalShare = list.reduce((s, p) => s + Math.max(0, Number(p.share) || 0), 0);
  if (list.length === 0 || !(totalShare > 0)) return [];

  let cursor = 0;
  return list.map((p, i) => {
    const share = Math.max(0, Number(p.share) || 0);
    const sweep = (share / totalShare) * 360;
    const startDeg = cursor;
    const endDeg = cursor + sweep;
    cursor = endDeg;
    const color =
      p.color ||
      DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return {
      id: p.id,
      name: p.name,
      startDeg,
      endDeg,
      midDeg: startDeg + sweep / 2,
      share,
      remaining: Number(p.remaining) || 0,
      color,
    };
  });
};

/**
 * Rotation degrees (CSS/canvas, clockwise from top) so the pointer at 12 o'clock
 * lands on the given segment. Adds full spins for drama.
 * @param {{ startDeg: number, endDeg: number }} segment
 * @param {number} [extraSpins]
 * @param {() => number} [rng]
 */
export const targetRotationDeg = (segment, extraSpins = 5, rng = Math.random) => {
  const span = segment.endDeg - segment.startDeg;
  // Point somewhere in the middle 60% of the segment to avoid borders
  const pad = span * 0.2;
  const within = segment.startDeg + pad + rng() * Math.max(0, span - pad * 2);
  // Canvas/CSS: rotation increases clockwise; pointer fixed at top.
  // Segment at `within` (from 0 at top, clockwise) should end under pointer:
  // finalRotation % 360 === (360 - within) % 360
  const align = (360 - within) % 360;
  return extraSpins * 360 + align;
};

export const DEFAULT_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#34495e',
  '#e91e63',
  '#00bcd4',
];

export const defaultPrizes = () => [
  { id: 'p1', name: '1등 경품', share: 10, total: 1, remaining: 1, color: '#e74c3c' },
  { id: 'p2', name: '2등 경품', share: 20, total: 5, remaining: 5, color: '#3498db' },
  { id: 'p3', name: '3등 경품', share: 30, total: 15, remaining: 15, color: '#2ecc71' },
  { id: 'p4', name: '기념품', share: 40, total: 50, remaining: 50, color: '#f39c12' },
];

/**
 * Convert totals into integer percents that sum to 100 (largest remainder).
 * @param {number[]} totals
 * @returns {number[]}
 */
/** Parse a user-typed integer that may contain grouping commas. */
export const parseGroupedInt = (value) => {
  const digits = String(value ?? '').replaceAll(/\D/g, '');
  if (!digits) return 0;
  return Number(digits);
};

/** Display an integer with thousands separators, e.g. 1000 → "1,000". */
export const formatGroupedInt = (value) => {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return n.toLocaleString('en-US');
};

export const percentsFromTotals = (totals) => {
  const nums = (Array.isArray(totals) ? totals : []).map((t) =>
    Math.max(0, Number(t) || 0),
  );
  if (nums.length === 0) return [];
  const sum = nums.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return nums.map(() => 0);

  const raw = nums.map((n) => (n / sum) * 100);
  const floors = raw.map((x) => Math.floor(x));
  let leftover = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .toSorted((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (leftover <= 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out;
};

/**
 * Normalize admin form prizes: ensure ids, clamp numbers.
 * @param {Partial<Prize>[]} raw
 * @returns {Prize[]}
 */
export const normalizePrizes = (raw) => {
  if (!Array.isArray(raw)) return defaultPrizes();
  return raw.map((p, i) => {
    const total = Math.max(0, Math.floor(Number(p.total) || 0));
    let remaining = Math.floor(Number(p.remaining));
    if (!Number.isFinite(remaining)) remaining = total;
    remaining = Math.min(total, Math.max(0, remaining));
    return {
      id: String(p.id || `p${i + 1}`),
      name: String(p.name || `경품 ${i + 1}`).trim() || `경품 ${i + 1}`,
      share: Math.max(0, Number(p.share) || 0),
      total,
      remaining,
      color: p.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    };
  });
};
