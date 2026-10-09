// The engine clock lives on an integer-millisecond grid. Float seconds add
// non-associatively — (t + a) + b !== t + (a + b) for about a quarter of random
// triples — so a split advance would drift off a whole one. Integers add exactly.

export const CLOCK_MS_PER_SEC = 1000;

/** `sec` as whole clock milliseconds. */
export function clockMs(sec: number): number {
  return Math.round(sec * CLOCK_MS_PER_SEC);
}

/**
 * The instant `deltaSec` after `startSec`, on the grid. Every producer of a
 * clock time — `advance`'s target and the client's strike stamps — adds through
 * here, so a stamp meant to land on a tick boundary is never an ulp past it.
 */
export function clockAfter(startSec: number, deltaSec: number): number {
  return (clockMs(startSec) + clockMs(deltaSec)) / CLOCK_MS_PER_SEC;
}
