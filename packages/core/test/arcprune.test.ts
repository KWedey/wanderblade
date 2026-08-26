import { describe, expect, it } from 'vitest';
import {
  advance,
  ARC_FLIGHT_SEC,
  arcPositionAt,
  initialState,
  serialize,
  type GameState,
} from '../src/index';
import { clone, roadAt, strikesAt } from './helpers';

/**
 * Kills and strikes prune at their own clocks, so before this every advance
 * that ended between two kills left the coins that landed in the gap sitting in
 * `state.arcs`, reporting no position. A field whose contents are partly
 * meaningless invites a second reader that filters it, and then the two readers
 * disagree — which is how `app/` grew four duplicate economies.
 */
function expectNoLandedArcs(s: GameState): void {
  for (const arc of s.arcs) {
    expect(arc.expiresAtSec).toBeGreaterThan(s.timeSec);
    // Stagger means a kill's later coins are legitimately not thrown yet, so
    // "has no position right now" is not the test — "has no catchable life
    // left" is. Sampled just after launch, every listed coin is still in play.
    const launch = arc.expiresAtSec - ARC_FLIGHT_SEC;
    const alive = Math.max(s.timeSec, launch + 1e-9);
    expect(arcPositionAt(arc, alive)).not.toBeNull();
  }
}

describe('the arc list holds only coins still in the air', () => {
  it('drops coins that landed after the last kill of the advance', () => {
    // Deliberately off any kill boundary, so the advance ends mid-flight for
    // some coins and well past the landing of others.
    for (const seconds of [600, 613.37, 7_777.5, 86_400]) {
      const s = roadAt(7, 10, 0.5);
      advance(s, seconds);
      expect(s.arcs.length).toBeGreaterThan(0);
      expectNoLandedArcs(s);
    }
  });

  it('drops them after a strike-heavy advance too', () => {
    const s = initialState(7);
    advance(s, 3_600.4, strikesAt(0, 3_600, 4));
    expectNoLandedArcs(s);
  });

  it('leaves nothing behind under the client\'s own 250 ms tick', () => {
    // `game.ts` drives advance on a 250 ms tick, so this is the shape that
    // actually ships. The per-kill prune bounds the residue rather than letting
    // it grow — it held a steady 2 to 3 dead coins — but a list that is always
    // a few coins wrong is exactly what a second reader gets written to filter.
    const s = initialState(7);
    for (let i = 0; i < 400; i++) advance(s, 0.25);
    expect(s.arcs.length).toBeGreaterThan(0);
    expectNoLandedArcs(s);
  });

  it('is split-invariant: the whole state, arcs included', () => {
    // Pruning mutates state, so it has to survive #6 rather than merely not
    // crash. An absolute clock does; an elapsed carry would not.
    for (const [a, b] of [
      [1, 7_199],
      [1_800, 5_400],
      [613.37, 4_386.63],
      [4_999.5, 0.5],
    ] as const) {
      const whole = roadAt(7, 10, 0.5);
      advance(whole, a + b);
      const split = roadAt(7, 10, 0.5);
      advance(split, a);
      advance(split, b);
      expect(serialize(split)).toBe(serialize(whole));
    }
  });

  it('is split-invariant under strikes, which prune at their own clock', () => {
    const strikes = strikesAt(0, 3_600, 4);
    const whole = initialState(7);
    advance(whole, 3_600.4, strikes);
    const split = initialState(7);
    advance(split, 1_234.5, strikes);
    advance(split, 3_600.4 - 1_234.5, strikes);
    expect(serialize(split)).toBe(serialize(whole));
  });

  it('never drops a coin that is still catchable', () => {
    // The failure mode on the other side: an over-eager prune silently eats
    // gold the player could still have caught.
    const kept = roadAt(7, 10, 0.5);
    advance(kept, 5_000);
    const before = kept.arcs.length;
    const again = clone(kept);
    advance(again, 0);
    expect(again.arcs.length).toBe(before);
    expect(kept.arcs.length).toBeGreaterThan(0);
  });
});
