import { describe, expect, it } from 'vitest';
import {
  advance,
  arcPositionAt,
  ARC_CATCH_SEC,
  ARC_FLIGHT_SEC,
  arcCatchRadius,
  arcSpeedAt,
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

function progress(arc: LootArc, atSec: number): number {
  return 1 - (arc.expiresAtSec - atSec) / ARC_FLIGHT_SEC;
}

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
    if (!arcPositionAt(arc, atSec)) continue;
    const p = progress(arc, atSec);
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

/** Catch rate over 400 taps at 3.3/s, aiming as a thumb would. */
function catchRate(target: Target, latencySec: number, scatter = 0): number {
  const s = busyRoad();
  advance(s, 3);
  let taps = 0;
  let caught = 0;
  for (let i = 0; i < 400; i++) {
    const at = s.timeSec + 1 / 3.3;
    const arc = pick(s, at, target);
    const aim = arc ? thumbAim(arc, at, latencySec, scatter, i) : null;
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
      const at = s.timeSec + 1 / 3.3;
      const events = advance(s, at - s.timeSec, [
        { atSec: at, aim: { x: 3.5, y: 2.5 } },
      ]);
      caught += events.filter((e) => e.type === 'arcCatch').length;
    }
    expect(caught).toBe(0);
  });

  it('degrades with aim error instead of handing out free catches', () => {
    // Under latency a little scatter can help, because tapping exactly where
    // the coin *was* is systematically behind it. Wild aim cannot.
    const sloppy = catchRate('landing', 0.25, 0.12);
    const wild = catchRate('landing', 0.25, 0.5);
    expect(wild).toBeLessThan(sloppy / 2);
    expect(wild).toBeLessThan(0.2);
  });
});
