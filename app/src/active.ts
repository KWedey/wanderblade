// Active-play input model: Strike, and the Momentum it builds
// (docs/ACTIVE-PLAY.md). Pure math only — no clocks, no DOM.
//
// These constants and this curve are the *engine's* eventually. Until
// `advance` accepts strike timestamps, `Game` runs this model alongside the
// engine so the meter shows what the player is building; it multiplies nothing
// in the economy, and the gold readout stays engine truth (DECISIONS.md #12).

/** Momentum added by one Strike. */
export const MOMENTUM_PER_STRIKE = 0.1;

/** Seconds for idle momentum to halve. */
export const MOMENTUM_HALF_LIFE_SEC = 2;

/** Multiplier at full momentum is 1 + this. */
export const MOMENTUM_MAX_BONUS = 1.2;

/** Strikes/sec that hold momentum at the cap — the "not restful" rate. */
export const MOMENTUM_SUSTAIN_RATE = 4;

/** Auto-strike cadence while the input is held (accessibility parity). */
export const HOLD_STRIKE_INTERVAL_SEC = 1 / MOMENTUM_SUSTAIN_RATE;

/** Exponential decay of momentum over `dtSec` with no input. */
export function decayMomentum(
  momentum: number,
  dtSec: number,
  halfLifeSec = MOMENTUM_HALF_LIFE_SEC,
): number {
  if (halfLifeSec <= 0) return 0;
  return momentum * Math.pow(2, -dtSec / halfLifeSec);
}

/** Momentum after one Strike, clamped to the [0,1] band. */
export function strikeMomentum(momentum: number, per = MOMENTUM_PER_STRIKE): number {
  const m = momentum + per;
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

/** Attack-speed / gold multiplier for a momentum level. */
export function momentumMultiplier(momentum: number, maxBonus = MOMENTUM_MAX_BONUS): number {
  return 1 + maxBonus * momentum;
}

/**
 * A Strike, stamped on the engine clock. `advance(state, dt, strikes)` will
 * consume these verbatim; see `Game.drainStrikes`.
 */
export interface Strike {
  /** Engine time (seconds) the strike was made at. */
  atSec: number;
  /** A strike that caught a loot arc in flight — pays ARC_CATCH_MULT. */
  caughtArc: boolean;
}
