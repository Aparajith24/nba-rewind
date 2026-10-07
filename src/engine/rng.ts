/**
 * Seeded random numbers: the same seed always produces the same sequence,
 * so a shared link can replay the exact same timeline.
 */

/** Hash a string seed into a 32-bit integer (xmur3). */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  between(range: readonly [number, number]): number;
  chance(p: number): boolean;
  /** Pick a key with probability proportional to its weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Standard normal (mean 0, sd 1). */
  normal(): number;
};

/** mulberry32: small, fast, and good enough for simulation. */
export function createRng(seed: string): Rng {
  let state = hashSeed(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: ([min, max]) => min + (max - min) * next(),
    chance: (p) => next() < p,
    weighted(items, weight) {
      const weights = items.map((i) => Math.max(0, weight(i)));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    normal() {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
  };
}
