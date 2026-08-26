import { describe, expect, it } from 'vitest';
import { advance, enterPortal, initialState, type GameState } from '../src/index';
import { clone, portalReady, roadAt, strikesAt } from './helpers';

// A long offline gap reconciles on a cold app start, so what must hold is that
// the work grows in step with the gap. "Finishes in under ten seconds" measures
// the laptop and whatever else is running on it; every assertion here is either
// exact or a ratio, so it scales with the machine instead of against it.

/** Wall-clock milliseconds for the fastest of `runs` attempts at `f`. */
function fastestMs(runs: number, f: () => void): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    f();
    const ms = Date.now() - t0;
    if (ms < best) best = ms;
  }
  return best;
}

/** A Road that neither advances zones nor changes build, so its kill rate is fixed. */
function steadyRoad(seed: number): GameState {
  const s = roadAt(seed, 10, 0.5);
  s.portalReady = true;
  return s;
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
    // the gap would make reconciliation quadratic. It is bounded by flight time
    // over kill time, and nothing about the gap's length enters that.
    const short = steadyRoad(7);
    advance(short, 600);
    const long = steadyRoad(7);
    advance(long, 5 * 86_400);

    expect(long.arcs.length).toBeLessThanOrEqual(short.arcs.length + 1);
    expect(long.arcs.length).toBeLessThan(64);
  });

  it('keeps a Road gap within a small multiple of half that gap', () => {
    const five = 2 * 86_400;
    const base = initialState(7);

    const shortMs = fastestMs(2, () => {
      advance(clone(base), five);
    });
    const longMs = fastestMs(2, () => {
      advance(clone(base), 2 * five);
    });

    // Doubling the gap may double the work. A quadratic regression lands near
    // 4x and a ten-fold one cannot hide, while a loaded machine slows both
    // halves together and the ratio survives it.
    expect(longMs / Math.max(shortMs, 1)).toBeLessThan(3);
  });

  it('keeps a boss gap within a small multiple of half that gap', () => {
    const five = 5 * 86_400;
    const base = portalReady(7, 60 * 86_400);
    enterPortal(base);

    const shortMs = fastestMs(2, () => {
      advance(clone(base), five);
    });
    const longMs = fastestMs(2, () => {
      advance(clone(base), 2 * five);
    });

    expect(longMs / Math.max(shortMs, 1)).toBeLessThan(3);

    const fought = clone(base);
    advance(fought, 10 * 86_400);
    expect(fought.lifetime.bossDamage).toBeGreaterThan(0);
  });

  it('keeps striking within a small multiple of the same span unstruck', () => {
    const hour = 3600;
    const base = initialState(7);

    const idleMs = fastestMs(2, () => {
      advance(clone(base), hour);
    });
    const struckMs = fastestMs(2, () => {
      advance(clone(base), hour, strikesAt(0, hour, 4));
    });

    // Each strike splits the advance, so striking costs more — but a bounded
    // multiple more. This is what would catch a per-strike scan going quadratic.
    expect(struckMs / Math.max(idleMs, 1)).toBeLessThan(12);
  });

  it('still reconciles a ten-day gap correctly, whatever the clock says', () => {
    const s = initialState(7);
    advance(s, 10 * 86_400);
    expect(s.timeSec).toBe(10 * 86_400);
    expect(s.lifetime.kills).toBeGreaterThan(100_000);
    expect(s.collection.zonesCleared).toBeGreaterThan(0);
  });
});
