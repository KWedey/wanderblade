// The one active input, shared unchanged by both phases (docs/ACTIVE-PLAY.md).
//
// Determinism: the (value, atSec) pair is rewritten only at strike and catch
// instants, which fall identically however an interval is split — so every
// lazy decay sees identical operands.

import {
  MOMENTUM_HALF_LIFE_SEC,
  MOMENTUM_MAX_BONUS,
  MOMENTUM_PER_STRIKE,
} from './constants';
import type { MomentumState } from './types';

/** Momentum in [0, 1] at absolute time `atSec`. */
export function momentumAt(m: MomentumState, atSec: number): number {
  const dt = atSec - m.atSec;
  if (!(dt > 0)) return m.value;
  const decayed = m.value * Math.pow(0.5, dt / MOMENTUM_HALF_LIFE_SEC);
  return Number.isFinite(decayed) ? decayed : 0;
}

/** Apply one input at `atSec`, returning the new pair. */
export function addMomentum(m: MomentumState, atSec: number, amount: number): MomentumState {
  const next = momentumAt(m, atSec) + amount;
  return { value: next > 1 ? 1 : next < 0 ? 0 : next, atSec };
}

/** Attack-speed multiplier from momentum: 1 at rest, 1 + MAX_BONUS at full. */
export function momentumMultiplier(momentum: number): number {
  return 1 + MOMENTUM_MAX_BONUS * momentum;
}

/**
 * Strikes per second that exactly holds momentum at 1. This is the rate the
 * accessibility hold auto-fires at, so it is also the ceiling any player can
 * reach without rapid repeated input.
 */
export function sustainStrikeRate(): number {
  return -Math.LN2 / (MOMENTUM_HALF_LIFE_SEC * Math.log(1 - MOMENTUM_PER_STRIKE));
}
