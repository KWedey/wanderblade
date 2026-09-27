// Idle and active share one schedule and differ only in whether a session
// strikes, so any comparison between them isolates the active input.

import {
  advance,
  arcPositionAt,
  sustainStrikeRate,
  type ArcPoint,
  type GameEvent,
  type GameState,
  type Strike,
} from '@wanderblade/core';
import { botTouch } from './bot';

export const SEC_PER_HOUR = 3600;
export const SEC_PER_DAY = 86_400;

/**
 * The reference active cadence: the rate that exactly sustains full momentum.
 * Holding the input auto-fires here, so it is the ceiling every player can
 * reach — including one who never taps (docs/ACTIVE-PLAY.md accessibility).
 */
export const CAP_RATE = sustainStrikeRate();

/**
 * The guardian band, in active minutes. The floor is 15 rather than 20 so the
 * opening realm's guardian fits inside one session: a first ascension a new
 * player can finish in a sitting beats a rounder number. The ceiling doubles as
 * the entry rule — the modelled player farms on past it (docs/DECISIONS.md #24).
 */
export const BOSS_MIN_SEC = 15 * 60;
export const BOSS_MAX_SEC = 90 * 60;

/** Evenly spaced strikes in (from, from + seconds], all aimed at `aim`. */
export function strikeTimes(
  from: number,
  seconds: number,
  rate: number,
  aim: ArcPoint | null = null,
): Strike[] {
  const out: Strike[] = [];
  if (!(rate > 0) || !(seconds > 0)) return out;
  const step = 1 / rate;
  const n = Math.floor(seconds * rate + 1e-9);
  for (let i = 1; i <= n; i++) out.push({ atSec: from + i * step, aim });
  return out;
}

/**
 * Where the oldest arc still in flight at `atSec` will be. The reference active
 * player aims at the coin they can see, so this is the ceiling a real player
 * approaches — not something the engine does for them.
 */
export function aimAtOldestArc(state: GameState, atSec: number): ArcPoint | null {
  for (const arc of state.arcs) {
    const p = arcPositionAt(arc, atSec);
    if (p) return p;
  }
  return null;
}

/** How often the player re-runs the purchase loop while a session is live. */
const TOUCH_INTERVAL_SEC = 30;
/** Granularity of an idle stretch. Coarse enough to be fast, fine enough to log. */
export const IDLE_SLICE_SEC = 60;

export interface RunHooks {
  onEvents?: (events: GameEvent[]) => void;
  /** Called after each slice, so the driver can sample and decide actions. */
  onSlice?: (state: GameState) => void;
  /** Purchases made by an in-session bot touch, so the driver can total them. */
  onPurchases?: (bought: { gold: number; tree: number }) => void;
  /**
   * Fired when the player would be looking at the upgrade panel — always
   * before a purchase loop runs, because the greedy bot drains the gold that
   * decides what is affordable.
   */
  onShop?: (state: GameState) => void;
}

// `f?.(advance(...))` never calls advance when f is undefined — optional
// chaining short-circuits its own arguments. Every loop below therefore
// advances first and reports second; folding the call back into the optional
// invocation stalls the clock and spins forever.

/** Advance `seconds` with no player input at all — the pure idle path. */
export function runIdle(state: GameState, seconds: number, hooks: RunHooks = {}): void {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(IDLE_SLICE_SEC, left);
    const events = advance(state, dt);
    hooks.onEvents?.(events);
    hooks.onShop?.(state);
    hooks.onSlice?.(state);
    left -= dt;
  }
}

/**
 * Advance `seconds` striking at `rate` with perfect aim and no purchases. The
 * advance stops at every strike, because the aim has to be taken from the arcs
 * actually in flight at that instant — position is what decides a catch.
 */
export function strikeThrough(
  state: GameState,
  seconds: number,
  rate: number,
  onEvents?: (events: GameEvent[]) => void,
): void {
  const end = state.timeSec + seconds;
  if (!(rate > 0)) {
    while (state.timeSec < end - 1e-9) {
      const events = advance(state, Math.min(IDLE_SLICE_SEC, end - state.timeSec));
      onEvents?.(events);
    }
    return;
  }

  const step = 1 / rate;
  let next = state.timeSec + step;
  while (state.timeSec < end - 1e-9) {
    const at = Math.min(next, end);
    const dt = at - state.timeSec;
    if (!(dt > 0)) break;
    const striking = at === next;
    const strikes: Strike[] = striking
      ? [{ atSec: next, aim: aimAtOldestArc(state, next) }]
      : [];
    const events = advance(state, dt, strikes);
    onEvents?.(events);
    if (striking) next += step;
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
    strikeThrough(state, dt, rate, hooks.onEvents);
    hooks.onShop?.(state);
    hooks.onPurchases?.(botTouch(state));
    hooks.onSlice?.(state);
    left -= dt;
  }
}

/** A check-in: the purchase loop, with no time advanced. */
export function checkIn(state: GameState): void {
  botTouch(state);
}
