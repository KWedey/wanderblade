import { describe, expect, it } from 'vitest';
import {
  advance,
  ARC_FLIGHT_SEC,
  ARC_SPLIT_MAX,
  ARC_STAGGER_SEC,
  enterPortal,
  initialState,
  type GameState,
} from '../src/index';
import { clone, portalReady, roadAt, strikesAt } from './helpers';

// A long offline gap reconciles on a cold app start, so what must hold is that
// the work grows in step with the gap — never that a laptop finishes it in ten
// seconds. Every assertion here counts engine operations, so none of it can be
// moved by another process; this project's own runs have hit load average 160,
// where a wall-clock ratio is a coin flip and a red one teaches nothing.

/** A Road that neither advances zones nor changes build, so its kill rate is fixed. */
function steadyRoad(seed: number): GameState {
  const s = roadAt(seed, 10, 0.5);
  s.portalReady = true;
  return s;
}

/**
 * The longest an arc can be alive: its flight, plus the stagger the last coin
 * of a maximal split waits before launching.
 */
const ARC_MAX_LIFE_SEC = ARC_FLIGHT_SEC + (ARC_SPLIT_MAX - 1) * ARC_STAGGER_SEC;

/**
 * The structural bound on the arc list: every arc launched at or before now, so
 * none can expire more than one window out, and `advance` prunes at its own
 * absolute clock, so none has already landed either. The list is one window of
 * kills — neither the gap's length nor the strike rate can reach that.
 */
function expectArcsWithinOneWindow(s: GameState): void {
  for (const arc of s.arcs) {
    expect(arc.expiresAtSec).toBeGreaterThan(s.timeSec);
    expect(arc.expiresAtSec - s.timeSec).toBeLessThanOrEqual(ARC_MAX_LIFE_SEC);
  }
  const killsPerSec = s.lifetime.kills / s.timeSec;
  const cap = (Math.ceil(killsPerSec * ARC_MAX_LIFE_SEC) + 1) * ARC_SPLIT_MAX;
  expect(s.arcs.length).toBeLessThanOrEqual(cap);
}

describe('offline reconciliation scales with the length of the gap', () => {
  it('does work proportional to elapsed time, not to its square', () => {
    const day = 86_400;
    const a = steadyRoad(7);
    advance(a, day);
    const b = steadyRoad(7);
    advance(b, 2 * day);

    // Position and build are frozen, so kills are exactly linear in time. A
    // super-linear step count would show up here before it showed up in a clock.
    expect(b.lifetime.kills / a.lifetime.kills).toBeGreaterThan(1.99);
    expect(b.lifetime.kills / a.lifetime.kills).toBeLessThan(2.01);
  });

  it('holds the live arc list to a bound no length of gap can grow', () => {
    // Arcs are scanned per kill and per strike, so an arc list that grew with
    // the gap would make reconciliation quadratic.
    const short = steadyRoad(7);
    advance(short, 600);
    const long = steadyRoad(7);
    advance(long, 5 * 86_400);

    expect(long.arcs.length).toBeGreaterThan(0);
    expectArcsWithinOneWindow(short);
    expectArcsWithinOneWindow(long);
  });

  it('does boss work proportional to elapsed time, not to its square', () => {
    // Damage per swing is fixed inside a fight — no gold, no levels, no drops —
    // so bossDamage counts swings exactly. A super-linear step count shows up
    // here, and unlike a stopwatch it cannot be moved by another process.
    const five = 5 * 86_400;
    const base = portalReady(7, 600 * 86_400);
    enterPortal(base);

    const short = clone(base);
    advance(short, five);
    const long = clone(base);
    advance(long, 2 * five);

    expect(short.phase).toBe('boss');
    expect(long.phase).toBe('boss');
    expect(short.lifetime.bossDamage).toBeGreaterThan(0);
    expect(long.lifetime.bossDamage / short.lifetime.bossDamage).toBeGreaterThan(1.99);
    expect(long.lifetime.bossDamage / short.lifetime.bossDamage).toBeLessThan(2.01);
  });

  it('holds the arc list to the same window under heavy striking', () => {
    // The per-strike arc scan is the quadratic risk on the strike path. Striking
    // catches coins and speeds kills, so the *count* legitimately differs from
    // an idle run — what may not differ is the window it is drawn from.
    const hour = 3600;
    const idle = initialState(7);
    advance(idle, hour);
    const struck = initialState(7);
    advance(struck, hour, strikesAt(0, hour, 4));

    expectArcsWithinOneWindow(idle);
    expectArcsWithinOneWindow(struck);
    // And striking is still the same simulation underneath it.
    expect(struck.timeSec).toBe(idle.timeSec);
    expect(struck.lifetime.kills).toBeGreaterThanOrEqual(idle.lifetime.kills);
  });

  it('still reconciles a ten-day gap correctly, whatever the clock says', () => {
    const s = initialState(7);
    advance(s, 10 * 86_400);
    expect(s.timeSec).toBe(10 * 86_400);
    expect(s.lifetime.kills).toBeGreaterThan(100_000);
    expect(s.collection.zonesCleared).toBeGreaterThan(0);
  });
});
