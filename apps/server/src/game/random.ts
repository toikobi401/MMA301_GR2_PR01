import { randomInt } from 'node:crypto';

/**
 * Cryptographically secure random source for shuffling.
 *
 * `Math.random` is a linear generator whose internal state can be recovered
 * from a handful of observed outputs. For a card game that means an opponent
 * who watches a few hands can predict the rest of the deck. `randomInt` draws
 * from the OS entropy pool instead.
 *
 * Returns a float in [0, 1) so it can be passed straight to the engine's
 * `shuffle`, which expects the same shape as `Math.random`.
 */
export function secureRandom(): number {
  // 2^32 distinct values is far more granularity than a 52-card shuffle needs,
  // and randomInt is unbiased (it rejects and redraws rather than taking a
  // modulus, which would skew the low values).
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}
