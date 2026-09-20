/**
 * Deterministic random source for tests.
 *
 * The engine takes `random` as a parameter precisely so tests can replace it.
 * xorshift32 is not cryptographically secure — that is the point; production
 * passes a crypto source, tests pass this so a failing case can be replayed
 * exactly.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}
