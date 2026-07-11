// Deterministic, serializable PRNG (mulberry32).
//
// All randomness in the core flows through this. The internal 32-bit state is
// exposed via getState/setState so it can be persisted on GameState.rngState and
// reconstructed exactly — which is what makes offline progress reproducible.

export interface Rng {
  /** Next float in [0, 1). Advances the stream by one step. */
  next(): number;
  /** Current 32-bit stream state (>>> 0). */
  getState(): number;
  /** Restore the stream to a previous state. */
  setState(state: number): void;
}

/**
 * Create a mulberry32 generator. `createRng(state.rngState)` reconstructs a
 * stream at the exact position it was serialized from.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState(): number {
      return a >>> 0;
    },
    setState(state: number): void {
      a = state >>> 0;
    },
  };
}
