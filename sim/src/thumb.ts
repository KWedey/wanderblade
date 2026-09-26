// A thumb, as a number: catch rate is the game plus how late and how loosely a
// human commits, so an oracle that aims perfectly measures the wrong thing.
// Models the two costs a thumb has — it aims where the coin *was*, and it
// misses by a bit. Headless against core, so the harness adds no latency of its
// own to the latency under test.

import {
  advance,
  ARC_CATCH_MULT,
  arcPositionAt,
  ARC_CATCH_SEC,
  clockMs,
  ARC_FLIGHT_SEC,
  ARC_MAX_REACH,
  ARC_MIN_REACH,
  createRng,
  initialState,
  type ArcPoint,
  type GameState,
  type LootArc,
  type Rng,
  type Strike,
} from '@wanderblade/core';

import { botTouch } from './bot';

/**
 * The catch radius varies with a coin's speed (docs/DECISIONS.md #35), so there
 * is no single constant to express scatter against. This is the radius a
 * mid-reach coin has at its apex — the tightest the window ever gets — which
 * makes "radii of slop" a worst-case reading rather than an average one.
 */
export const REFERENCE_RADIUS =
  (ARC_CATCH_SEC * ((ARC_MIN_REACH + ARC_MAX_REACH) / 2)) / ARC_FLIGHT_SEC;

export interface Thumb {
  /** Milliseconds between seeing the coin and the strike being stamped. */
  latencyMs: number;
  /** Gaussian aim scatter, one standard deviation, in scene pixels. */
  scatterPx: number;
  /** Taps per second. */
  tapsPerSec: number;
  /**
   * Which coin the thumb goes for. Near landing a coin's vertical speed is at
   * its greatest, so the same timing error moves it furthest; at the apex the
   * vertical speed passes through zero. Same mechanic, very different mercy.
   */
  pick: 'landing' | 'apex';
  /**
   * How much of the latency the player predicts away by leading the coin, 0..1.
   * An arc's path is deterministic and fully visible, so a practised thumb
   * throws at where it is going; 0 is a player who never learns that.
   */
  lead: number;
}

export interface ThumbResult {
  thumb: Thumb;
  taps: number;
  /** Taps that had a coin on screen to aim at. */
  aimed: number;
  /** Aimed taps whose chosen coin had landed before the strike resolved. */
  doomed: number;
  /** Catches that took the coin the player actually aimed at, not a neighbour. */
  intendedHits: number;
  catches: number;
  /** Catches per aimed tap. */
  catchRate: number;
  /** Share of catches that were the aimed coin. 0 means every catch was luck. */
  intendedRate: number;
  goldPerSec: number;
  /** Multiple of the same state left alone for the same span. */
  vsIdle: number;
  /** Scatter as a multiple of `REFERENCE_RADIUS`, the tightest the window gets. */
  scatterRadii: number;
}

/**
 * Scene pixels per unit of core's arc space — the apex height the client draws
 * a unit-high arc at. A flag rather than a constant because it is the *client's*
 * number: core's arc space is resolution-free, and sim must not hold a second
 * copy of a rendering decision.
 */
export const DEFAULT_PX_PER_UNIT = 31;

/** Box–Muller, off the engine's own seeded stream so a sweep replays exactly. */
function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/**
 * A mid-game Road state: real engine time, real purchases, no gear handed out.
 * Deep enough that coins are frequent and cheap upgrades are gone, which is
 * where the catch question actually lives.
 */
export function warmState(seed: number, hours = 6, rounds = 40): GameState {
  const state = initialState(seed);
  const chunk = (hours * 3600) / rounds;
  for (let i = 0; i < rounds; i++) {
    advance(state, chunk);
    botTouch(state);
  }
  return state;
}

/**
 * The coin a thumb goes for: seen at `sawAt`, and still in the air at `hitAt` —
 * which must be when the strike *resolves*, not when the player aimed. Nobody
 * throws at a coin that will have landed by the time their thumb lands.
 */
function target(
  arcs: readonly LootArc[],
  sawAt: number,
  hitAt: number,
  pick: 'landing' | 'apex',
): LootArc | null {
  let best: LootArc | null = null;
  let bestScore = -Infinity;
  for (const arc of arcs) {
    const seenP = 1 - (arc.expiresAtSec - sawAt) / ARC_FLIGHT_SEC;
    const hitP = 1 - (arc.expiresAtSec - hitAt) / ARC_FLIGHT_SEC;
    if (seenP <= 0 || seenP >= 1) continue;
    if (hitP <= 0 || hitP >= 1) continue;
    const score = pick === 'landing' ? hitP : -Math.abs(hitP - 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = arc;
    }
  }
  return best;
}

export interface SweepOptions {
  seed: number;
  /** Seconds of play measured per cell. */
  seconds: number;
  pxPerUnit: number;
  /** Consecutive seeds averaged per cell. */
  seeds: number;
}

/**
 * Play `seconds` with one thumb and report what it caught. Stepped one tap
 * apart so every strike is stamped inside the interval `advance` processes. A
 * coin committed to may have landed before the strike resolves; missing those
 * is the cost being measured, not a flaw in the model.
 */
export function runThumb(thumb: Thumb, opts: SweepOptions, warm?: GameState): ThumbResult {
  const state = structuredClone(warm ?? warmState(opts.seed));
  const idle = runIdle(state, opts.seconds);

  const rng = createRng(opts.seed ^ 0x5eed);
  const period = 1 / thumb.tapsPerSec;
  const latency = thumb.latencyMs / 1000;
  const scatter = thumb.scatterPx / opts.pxPerUnit;

  // What the player could see, oldest first, covering the latency window.
  const seen: { atSec: number; arcs: LootArc[] }[] = [];
  let taps = 0;
  let aimed = 0;
  let catches = 0;
  let doomed = 0;
  let intendedHits = 0;
  const gold0 = state.gold;
  const t0 = state.timeSec;

  while (state.timeSec - t0 < opts.seconds) {
    seen.push({ atSec: state.timeSec, arcs: [...state.arcs] });
    // Compared in clock milliseconds: a float subtraction lands an ulp either
    // side of a frame stamp and silently picks a frame one tap staler.
    const sawMs = clockMs(state.timeSec) - thumb.latencyMs;
    while (seen.length > 2 && clockMs(seen[1]!.atSec) <= sawMs) seen.shift();


    // The strike resolves here; the player saw the coin `latency` before that.
    // Anchoring the aim to `state.timeSec` instead leaves it half a tap stale
    // even at zero latency, which reads as the game being uncatchable.
    const strikeAt = state.timeSec + period / 2;
    const frame = seen[0]!;
    const sawAt = strikeAt - latency;
    const aimAt = sawAt + thumb.lead * latency;
    // `strikeAt`, never `aimAt`: at the default `lead: 0` they are the same
    // number, which collapsed this guard into `seenP` twice and let the bot
    // commit to coins already on the ground by the time the strike resolved.
    const mark = target(frame.arcs, sawAt, strikeAt, thumb.pick);
    let aim: ArcPoint | null = null;
    if (mark) {
      const p = arcPositionAt(mark, aimAt);
      if (p) {
        aim = { x: p.x + gaussian(rng) * scatter, y: p.y + gaussian(rng) * scatter };
        aimed += 1;
        if (!arcPositionAt(mark, strikeAt)) doomed += 1;
      }
    }
    const strikes: Strike[] = [{ atSec: strikeAt, aim }];
    taps += 1;

    const events = advance(state, period, strikes);
    // Identify the caught coin by its payout rather than by splitting the
    // advance: `advance` skips a strike stamped exactly at its start, so
    // stopping the clock on the strike instant silently drops it. `bonusGold`
    // is the same multiplication the engine did, so the compare is exact.
    // Coin shares are spread per-coin (#44), which makes collisions rare but
    // not impossible — this is a reported number, never an assertion.
    const wanted = mark ? mark.gold * (ARC_CATCH_MULT - 1) : NaN;
    for (const e of events) {
      if (e.type !== 'arcCatch') continue;
      catches += 1;
      if (e.bonusGold === wanted) intendedHits += 1;
    }
  }

  const secs = state.timeSec - t0;
  const goldPerSec = (state.gold - gold0) / secs;
  return {
    thumb,
    taps,
    aimed,
    doomed,
    intendedHits,
    catches,
    catchRate: aimed > 0 ? catches / aimed : 0,
    intendedRate: catches > 0 ? intendedHits / catches : 0,
    goldPerSec,
    vsIdle: idle > 0 ? goldPerSec / idle : 0,
    scatterRadii: scatter / REFERENCE_RADIUS,
  };
}

/** The same state, left alone — the number every cell is a multiple of. */
export function runIdle(from: GameState, seconds: number): number {
  const state = structuredClone(from);
  const gold0 = state.gold;
  advance(state, seconds);
  return (state.gold - gold0) / seconds;
}

export interface SweepAxes {
  latencyMs: number[];
  scatterPx: number[];
  tapsPerSec: number[];
  lead: number[];
  pick: ('landing' | 'apex')[];
}

/**
 * Averaged over seeds, because a caught arc can upgrade gear and a single lucky
 * upgrade compounds into the gold rate for the rest of the run. One seed
 * measures that luck as much as the thumb.
 */
function averaged(thumb: Thumb, opts: SweepOptions, warms: GameState[]): ThumbResult {
  const runs = warms.map((w, i) => runThumb(thumb, { ...opts, seed: opts.seed + i }, w));
  const mean = (pick: (r: ThumbResult) => number): number =>
    runs.reduce((sum, r) => sum + pick(r), 0) / runs.length;
  return {
    thumb,
    taps: runs.reduce((n, r) => n + r.taps, 0),
    aimed: runs.reduce((n, r) => n + r.aimed, 0),
    doomed: runs.reduce((n, r) => n + r.doomed, 0),
    intendedHits: runs.reduce((n, r) => n + r.intendedHits, 0),
    catches: runs.reduce((n, r) => n + r.catches, 0),
    catchRate: mean((r) => r.catchRate),
    intendedRate: mean((r) => r.intendedRate),
    goldPerSec: mean((r) => r.goldPerSec),
    vsIdle: mean((r) => r.vsIdle),
    scatterRadii: runs[0]!.scatterRadii,
  };
}

/** Every combination, in a stable order. */
export function sweep(axes: SweepAxes, opts: SweepOptions): ThumbResult[] {
  const warms = Array.from({ length: Math.max(1, opts.seeds) }, (_, i) =>
    warmState(opts.seed + i),
  );
  const out: ThumbResult[] = [];
  for (const tapsPerSec of axes.tapsPerSec) {
    for (const lead of axes.lead) {
      for (const pick of axes.pick) {
        for (const latencyMs of axes.latencyMs) {
          for (const scatterPx of axes.scatterPx) {
            out.push(averaged({ latencyMs, scatterPx, tapsPerSec, lead, pick }, opts, warms));
          }
        }
      }
    }
  }
  return out;
}
