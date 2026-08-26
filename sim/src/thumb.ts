// A thumb, as a number: catch rate is the game plus how late and how loosely a
// human commits, so an oracle that aims perfectly measures the wrong thing.
// Models the two costs a thumb has — it aims where the coin *was*, and it
// misses by a bit. Headless against core, so the harness adds no latency of its
// own to the latency under test.

import {
  advance,
  arcPositionAt,
  ARC_FLIGHT_SEC,
  createRng,
  initialState,
  type ArcPoint,
  type GameState,
  type LootArc,
  type Rng,
  type Strike,
} from '@wanderblade/core';

import { botTouch } from './bot';

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
  catches: number;
  /** Catches per aimed tap. */
  catchRate: number;
  goldPerSec: number;
  /** Multiple of the same state left alone for the same span. */
  vsIdle: number;
  /** Scatter expressed against the window it has to land in. */
  /** Aim scatter in arc-space units. The catch radius is no longer a constant
   * (DECISIONS.md #35), so this cannot be expressed as a multiple of one. */
  scatterUnits: number;
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
 * The coin a thumb goes for: seen at `sawAt`, and still in the air at `hitAt`.
 * Nobody throws at a coin that will have landed — requiring both is what stops
 * the model punishing a player for anticipating well.
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
  const gold0 = state.gold;
  const t0 = state.timeSec;

  while (state.timeSec - t0 < opts.seconds) {
    seen.push({ atSec: state.timeSec, arcs: [...state.arcs] });
    while (seen.length > 2 && seen[1]!.atSec <= state.timeSec - latency) seen.shift();


    // The strike resolves here; the player saw the coin `latency` before that.
    // Anchoring the aim to `state.timeSec` instead leaves it half a tap stale
    // even at zero latency, which reads as the game being uncatchable.
    const strikeAt = state.timeSec + period / 2;
    const frame = seen[0]!;
    const sawAt = strikeAt - latency;
    const aimAt = sawAt + thumb.lead * latency;
    const mark = target(frame.arcs, sawAt, aimAt, thumb.pick);
    let aim: ArcPoint | null = null;
    if (mark) {
      const p = arcPositionAt(mark, aimAt);
      if (p) {
        aim = { x: p.x + gaussian(rng) * scatter, y: p.y + gaussian(rng) * scatter };
        aimed += 1;
      }
    }
    const strikes: Strike[] = [{ atSec: strikeAt, aim }];
    taps += 1;

    const events = advance(state, period, strikes);
    for (const e of events) if (e.type === 'arcCatch') catches += 1;
  }

  const secs = state.timeSec - t0;
  const goldPerSec = (state.gold - gold0) / secs;
  return {
    thumb,
    taps,
    aimed,
    catches,
    catchRate: aimed > 0 ? catches / aimed : 0,
    goldPerSec,
    vsIdle: idle > 0 ? goldPerSec / idle : 0,
    scatterUnits: scatter,
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
    catches: runs.reduce((n, r) => n + r.catches, 0),
    catchRate: mean((r) => r.catchRate),
    goldPerSec: mean((r) => r.goldPerSec),
    vsIdle: mean((r) => r.vsIdle),
    scatterUnits: runs[0]!.scatterUnits,
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
