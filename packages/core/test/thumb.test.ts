import { describe, expect, it } from 'vitest';
import {
  advance,
  arcPositionAt,
  arcProgress,
  ARC_CATCH_SEC,
  ARC_FLIGHT_SEC,
  arcCatchRadius,
  arcHitIndex,
  arcSpeedAt,
  clockAfter,
  initialState,
  type ArcPoint,
  type GameState,
  type LootArc,
} from '../src/index';
import { roadAt } from './helpers';

// The acceptance test for the constant-time catch window (docs/DECISIONS.md
// #35). A fixed-distance radius is generous where a coin is slow and near-zero
// where it is fast, so which coin a player reached for mattered more than how
// fast they reacted — on knowledge the game never communicates.

/** Which coin in the air the player goes for. */
type Target = 'apex' | 'landing';

/**
 * ⚠️ Not actually busy. Setting `hero.level` and `zone` by hand leaves the kill
 * schedule untouched, so this lands exactly **one** kill and then idles 27 s.
 * Before #41 pruned landed coins, the three it left behind were all already
 * down — the geometry assertions below read real numbers off dead coins.
 *
 * `liveArcRoad()` is the honest version. Swapping every use over strengthens
 * five tests and turns 'degrades with aim error' red on a true measurement, so
 * it is a re-calibration of what that test asserts rather than a fixture fix,
 * and is Kyle's call. See the finding reported with #41.
 */
function busyRoad(): GameState {
  const s = initialState(17);
  s.hero.level = 40;
  s.zone = 20;
  return s;
}

/** A Road whose schedule matches its build: ~13 coins genuinely in the air. */
function liveArcRoad(): GameState {
  return roadAt(17, 20, 0.3);
}

/** The arc nearest the apex, or nearest landing, among those in flight. */
function pick(state: GameState, atSec: number, target: Target): LootArc | null {
  let best: LootArc | null = null;
  let bestScore = Infinity;
  for (const arc of state.arcs) {
    const p = arcProgress(arc, atSec);
    if (p === null) continue;
    const score = target === 'apex' ? Math.abs(p - 0.5) : 1 - p;
    if (score < bestScore) {
      bestScore = score;
      best = arc;
    }
  }
  return best;
}

/**
 * A thumb: the player taps where the coin was `latencySec` ago, off by
 * `scatter` arc units on a golden-angle spiral — even, and repeatable.
 */
function thumbAim(
  arc: LootArc,
  atSec: number,
  latencySec: number,
  scatter: number,
  n: number,
): ArcPoint | null {
  const seen = arcPositionAt(arc, atSec - latencySec);
  if (!seen) return null;
  if (scatter === 0) return seen;
  const a = n * 2.399_963_229_728_653;
  return { x: seen.x + scatter * Math.cos(a), y: seen.y + scatter * Math.sin(a) };
}

/**
 * Catch rate over 4000 taps at 3.3/s, aiming as a thumb would. `busyRoad`
 * idles 27 s between kills, so 400 taps see only ~26 coins and two catches of
 * luck decide the wide-scatter ratio; ten times that is a measurement.
 */
function catchRate(target: Target, latencySec: number, scatter = 0): number {
  const s = busyRoad();
  advance(s, 3);
  let taps = 0;
  let caught = 0;
  for (let i = 0; i < 4000; i++) {
    const at = clockAfter(s.timeSec, 1 / 3.3);
    const arc = pick(s, at, target);
    const aim = arc ? thumbAim(arc, at, latencySec, scatter, i) : null;
    const events = advance(s, at - s.timeSec, [{ atSec: at, aim }]);
    if (aim) taps += 1;
    caught += events.filter((e) => e.type === 'arcCatch').length;
  }
  return taps === 0 ? 0 : caught / taps;
}

/**
 * Share of catches that were the coin actually aimed at, on a genuinely busy
 * road. This is the property that separates a skilled tap from a lucky one: in
 * a field this dense, catching *a* coin while aiming at nothing is the loot
 * stream working, not the mechanic failing. It read **0%** under a circular
 * window — the aimed coin sat 1.5 radii away on every sample, so every catch
 * was incidental (`docs/DECISIONS.md` #45).
 */
function intendedShare(target: Target, latencySec: number, scatter = 0): number {
  const s = liveArcRoad();
  let caught = 0;
  let intended = 0;
  for (let i = 0; i < 400; i++) {
    const at = clockAfter(s.timeSec, 1 / 3.3);
    const arc = pick(s, at, target);
    const aim = arc ? thumbAim(arc, at, latencySec, scatter, i) : null;
    if (arc && aim) {
      const hit = arcHitIndex(s.arcs, aim, at);
      if (hit >= 0) {
        caught += 1;
        if (s.arcs[hit] === arc) intended += 1;
      }
    }
    advance(s, at - s.timeSec, [{ atSec: at, aim }]);
  }
  return caught === 0 ? 0 : intended / caught;
}

/** Catch rate on a busy road for a player whose real reaction time is `lat`. */
function rateAtLatency(lat: number): number {
  const s = liveArcRoad();
  let taps = 0;
  let caught = 0;
  for (let i = 0; i < 400; i++) {
    const at = clockAfter(s.timeSec, 1 / 3.3);
    const arc = pick(s, at, 'landing');
    const aim = arc ? thumbAim(arc, at, lat, 0, i) : null;
    const events = advance(s, at - s.timeSec, [{ atSec: at, aim }]);
    if (aim) taps += 1;
    caught += events.filter((e) => e.type === 'arcCatch').length;
  }
  return taps === 0 ? 0 : caught / taps;
}

/** One coin alone in the air, tapped once at flight progress `p`. */
function soloCatch(p: number, latencySec: number, landingX: number): boolean {
  const s = busyRoad();
  const launch = s.timeSec + 0.001;
  const arc: LootArc = {
    gold: 100,
    expiresAtSec: launch + ARC_FLIGHT_SEC,
    landingX,
    gear: null,
  };
  s.arcs = [arc];
  s.nextActionAtSec = s.timeSec + 1e6; // no kills, so no other coin appears
  const at = launch + p * ARC_FLIGHT_SEC;
  const seen = arcPositionAt(arc, at - latencySec);
  if (!seen) return false;
  const events = advance(s, at - s.timeSec, [{ atSec: at, aim: seen }]);
  return events.some((e) => e.type === 'arcCatch');
}

/**
 * Any coin currently in the air, for probing geometry. `advance` prunes landed
 * coins at its own clock (#41), so a fixed advance can legitimately end with an
 * empty list — stepping until one exists is what makes this independent of
 * where the kill schedule happens to fall.
 */
function airborneArc(s: GameState): LootArc {
  for (let i = 0; i < 400 && s.arcs.length === 0; i++) advance(s, 0.05);
  const arc = s.arcs[0];
  expect(arc).toBeTruthy();
  return arc as LootArc;
}

const REACHES = [0.5, 0.7, 0.9, 1.1, 1.3, 1.5];

describe('the catch window is constant in time, not in distance', () => {
  it('gives every point of the flight the same forgiveness in milliseconds', () => {
    const s = liveArcRoad();
    advance(s, 3);
    const arc = airborneArc(s);

    const launch = arc.expiresAtSec - ARC_FLIGHT_SEC;
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const at = launch + p * ARC_FLIGHT_SEC;
      const speed = arcSpeedAt(arc, at);
      expect(speed).toBeGreaterThan(0);
      // Radius over speed is the window in seconds, and it is the constant.
      expect(arcCatchRadius(arc, at) / speed).toBeCloseTo(ARC_CATCH_SEC, 12);
    }
  });

  it('opens wider where the coin moves faster, which is near the ground', () => {
    const s = liveArcRoad();
    advance(s, 3);
    const arc = airborneArc(s);
    const launch = arc.expiresAtSec - ARC_FLIGHT_SEC;
    expect(arcCatchRadius(arc, launch + 0.95 * ARC_FLIGHT_SEC)).toBeGreaterThan(
      arcCatchRadius(arc, launch + 0.5 * ARC_FLIGHT_SEC) * 2,
    );
  });

  /**
   * The cliff, isolated to the geometry that causes it. With a fixed radius a
   * 50 ms reach for a coin near landing caught on only half the reaches while
   * the same reach at the apex caught on all of them.
   */
  it('catches near landing as reliably as at the apex, reach for reach', () => {
    for (const latency of [0, 0.05]) {
      for (const x of REACHES) {
        expect(soloCatch(0.5, latency, x), `apex x=${x} @${latency}s`).toBe(true);
        expect(soloCatch(0.95, latency, x), `landing x=${x} @${latency}s`).toBe(true);
      }
    }
  });

  /**
   * And in play, where several coins are in the air. The gap between the two
   * choices is the thing the ruling was about; anything large means the window
   * has drifted back to being fixed.
   */
  it('leaves no penalty for reaching at the wrong moment of the flight', () => {
    for (const latency of [0, 0.05]) {
      expect(catchRate('apex', latency)).toBeGreaterThan(0.9);
      expect(catchRate('landing', latency)).toBeGreaterThan(0.9);
    }

    const apex = catchRate('apex', 0.25);
    const landing = catchRate('landing', 0.25);
    expect(apex).toBeGreaterThan(0.15);
    expect(landing).toBeGreaterThan(0.15);

    const gap = Math.max(apex, landing) / Math.min(apex, landing);
    expect(gap, `apex ${apex.toFixed(3)} vs landing ${landing.toFixed(3)}`).toBeLessThan(1.3);
  });

  it('still asks for aim — a tap at empty sky catches nothing', () => {
    const s = busyRoad();
    advance(s, 3);
    let caught = 0;
    for (let i = 0; i < 200; i++) {
      const at = clockAfter(s.timeSec, 1 / 3.3);
      const events = advance(s, at - s.timeSec, [
        { atSec: at, aim: { x: 3.5, y: 2.5 } },
      ]);
      caught += events.filter((e) => e.type === 'arcCatch').length;
    }
    expect(caught).toBe(0);
  });

  /**
   * Asserted on `intended` because catch rate in a field this dense partly
   * measures how many coins are in the air. Stops at ±0.5: at ±1.0 the sample
   * collapses to 35 catches against 230, and 10-of-35 reads as 0.29 beside
   * 24-of-230 at 0.10. That ratio is not comparable, so nothing is asserted on it.
   */
  it('degrades with aim error instead of handing out free catches', () => {
    const perfect = intendedShare('landing', 0.25, 0);
    const sloppy = intendedShare('landing', 0.25, 0.12);
    const off = intendedShare('landing', 0.25, 0.25);
    const wide = intendedShare('landing', 0.25, 0.5);

    expect(perfect, `perfect ${perfect.toFixed(3)}`).toBeGreaterThan(0.25);
    expect(off, `off ${off.toFixed(3)} vs perfect ${perfect.toFixed(3)}`).toBeLessThan(perfect / 2);
    expect(wide, `wide ${wide.toFixed(3)} vs sloppy ${sloppy.toFixed(3)}`).toBeLessThan(sloppy);
    expect(catchRate('landing', 0.25, 0.5)).toBeLessThan(catchRate('landing', 0.25, 0.12) / 2);
  });
});

describe('the window separates being late from aiming badly', () => {
  /**
   * The catch window is an ellipse aligned to the coin's travel. Latency
   * displaces a tap *along* the path and is forgiven; a stray tap scatters in
   * every direction and is not. One circle at one instant was both tolerances
   * at once, so tightening either tightened both.
   */
  it('catches the coin the player aimed at, not a neighbour', () => {
    const share = intendedShare('landing', 0.25);
    // 34% measured, against 0% under a circle. Modest, and the honest number:
    // an earlier harness read 97% because it passed an empty strike array, so
    // caught coins were never removed and the same coin was re-aimed at.
    expect(share, `intended ${(share * 100).toFixed(0)}%`).toBeGreaterThan(0.25);
  });

  /**
   * ⚠️ The apex is where this shape does **not** work, and the number is the
   * parabola's own curvature: over a 250 ms window the seen position sits
   * **0.111** across the tangent at p=0.5, against 0.014-0.047 near the ground.
   * Widening `ARC_CATCH_PERP` past 0.111 does not rescue it — measured 0% at
   * 0.10, 0.14, 0.18 and 0.24 — because a neighbour then scores lower than the
   * aimed coin. Pinned as a known limit rather than left to be rediscovered.
   */
  it('cannot yet do the same at the apex, and says so', () => {
    expect(intendedShare('apex', 0.25)).toBeLessThan(0.1);
  });

  /**
   * The trap this shape avoids. Compensating for latency with a constant made
   * the catch rate a narrow spike around the reaction time the constant
   * assumed — 0.087 at 150 ms, 1.000 at 250 ms, 0.022 at 300 ms — which
   * rewards having particular reflexes rather than aiming. A generous
   * along-path axis is flat across the whole human range instead.
   */
  it('does not reward one particular reaction time', () => {
    const rates = [0.1, 0.15, 0.25, 0.35, 0.45].map(rateAtLatency);
    for (const r of rates)
      expect(r, `rates ${rates.map((x) => x.toFixed(2)).join('/')}`).toBeGreaterThan(0.85);
    const spread = Math.max(...rates) / Math.min(...rates);
    expect(spread, `spread ${spread.toFixed(2)}`).toBeLessThan(1.3);
  });

  it('still refuses a tap that is simply in the wrong place', () => {
    // Across-path error is not forgiven, however well timed the tap is.
    expect(intendedShare('landing', 0.25, 0.6)).toBeLessThan(0.5);
  });
});
