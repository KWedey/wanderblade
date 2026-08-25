// Idle and active share one schedule and differ only in whether a session
// strikes, so any comparison between them isolates the active input.

import { advance, sustainStrikeRate, type GameEvent, type GameState } from '@wanderblade/core';
import { botTouch } from './bot';

export const SEC_PER_HOUR = 3600;
export const SEC_PER_DAY = 86_400;

/**
 * The reference active cadence: the rate that exactly sustains full momentum.
 * Holding the input auto-fires here, so it is the ceiling every player can
 * reach — including one who never taps (docs/ACTIVE-PLAY.md accessibility).
 */
export const CAP_RATE = sustainStrikeRate();

/** Evenly spaced strike timestamps in (from, from + seconds]. */
export function strikeTimes(from: number, seconds: number, rate: number): number[] {
  const out: number[] = [];
  if (!(rate > 0) || !(seconds > 0)) return out;
  const step = 1 / rate;
  const n = Math.floor(seconds * rate + 1e-9);
  for (let i = 1; i <= n; i++) out.push(from + i * step);
  return out;
}

/** How often the player re-runs the purchase loop while a session is live. */
const TOUCH_INTERVAL_SEC = 30;
/** Granularity of an idle stretch. Coarse enough to be fast, fine enough to log. */
const IDLE_SLICE_SEC = 60;

export interface RunHooks {
  onEvents?: (events: GameEvent[]) => void;
  /** Called after each slice, so the driver can sample and decide actions. */
  onSlice?: (state: GameState) => void;
}

/** Advance `seconds` with no player input at all — the pure idle path. */
export function runIdle(state: GameState, seconds: number, hooks: RunHooks = {}): void {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(IDLE_SLICE_SEC, left);
    hooks.onEvents?.(advance(state, dt));
    hooks.onSlice?.(state);
    left -= dt;
  }
}

/**
 * Advance `seconds` of an active session: strikes at `rate` throughout, with the
 * purchase loop run every TOUCH_INTERVAL_SEC.
 */
export function runActive(
  state: GameState,
  seconds: number,
  rate: number,
  hooks: RunHooks = {},
): void {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(TOUCH_INTERVAL_SEC, left);
    const from = state.timeSec;
    hooks.onEvents?.(advance(state, dt, strikeTimes(from, dt, rate)));
    botTouch(state);
    hooks.onSlice?.(state);
    left -= dt;
  }
}

/** A check-in: the purchase loop, with no time advanced. */
export function checkIn(state: GameState): void {
  botTouch(state);
}
