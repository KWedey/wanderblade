import { describe, expect, it } from 'vitest';
import {
  advance,
  ARC_CATCH_MULT,
  ARC_FLIGHT_SEC,
  enterPortal,
  initialState,
  serialize,
  summarizeEvents,
} from '../src/index';
import { portalReady, roadAt, ROAD_KILL0_SEC, strikesAt } from './helpers';

// The contract that keeps idle honest: a kill credits full base gold the moment
// it lands, so an uncaught arc costs nothing. A catch pays only the increment.
describe('loot arcs', () => {
  it('leaves idle gold untouched — uncaught arcs still pay in full', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6); // one kill at the walking pace
    expect(s.lifetime.kills).toBe(1);
    expect(s.gold).toBeCloseTo(1, 10); // enemyGold(0, 0) = 1
    expect(s.arcs).toHaveLength(1);

    advance(s, ARC_FLIGHT_SEC + 2); // the arc lands uncaught
    expect(s.gold).toBeGreaterThan(1);
  });

  it('pays the catch increment on top of the base gold already credited', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6);
    const afterKill = s.gold;
    expect(s.arcs).toHaveLength(1);

    // One strike mid-flight, before the next kill lands.
    const events = advance(s, ROAD_KILL0_SEC / 2, [1.5 * ROAD_KILL0_SEC]);
    const catches = events.filter((e) => e.type === 'arcCatch');
    expect(catches).toHaveLength(1);
    expect(s.gold).toBeCloseTo(afterKill * ARC_CATCH_MULT, 10);
    expect(catches[0]).toMatchObject({ bonusGold: afterKill * (ARC_CATCH_MULT - 1) });
  });

  it('cannot catch an arc that has already landed', () => {
    // A slow zone, so the arc expires long before the next kill spawns another.
    const s = roadAt(31, 20, 10);
    advance(s, 10.001);
    const afterKill = s.gold;
    const events = advance(s, 3, [10 + ARC_FLIGHT_SEC + 0.05]);
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.gold).toBe(afterKill);
  });

  it('catches at most one arc per strike, oldest first', () => {
    const s = initialState(31);
    advance(s, 4.001); // several kills, their arcs still in flight at t=4
    expect(s.arcs.length).toBeGreaterThanOrEqual(2);
    const events = advance(s, 0.2, [4.1]);
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(1);
  });

  it('never spawns or catches arcs during the boss phase', () => {
    const s = portalReady(32, 4 * 3600);
    enterPortal(s);
    expect(s.arcs).toEqual([]);
    const events = advance(s, 600, strikesAt(s.timeSec, 600, 4));
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.arcs).toEqual([]);
  });

  it('counts catch gold in the recap', () => {
    const s = initialState(33);
    const goldBefore = s.gold;
    const events = advance(s, 900, strikesAt(0, 900, 4));
    const recap = summarizeEvents(events);
    expect(recap.arcCatches).toBeGreaterThan(0);
    expect(recap.goldEarned).toBeCloseTo(s.gold - goldBefore, 6);
  });

  it('upgrades a caught gear arc one rarity tier', () => {
    // Sweep seeds until a caught arc reports an upgrade equip; the roll itself
    // is seeded, so the sweep is deterministic.
    let upgraded = 0;
    for (let seed = 1; seed <= 40 && upgraded === 0; seed++) {
      const s = initialState(seed);
      const events = advance(s, 4000, strikesAt(0, 4000, 4));
      upgraded += events.filter((e) => e.type === 'arcCatch' && e.upgraded).length;
    }
    expect(upgraded).toBeGreaterThan(0);
  });

  it('is byte-identical under a split advance that lands between arc and catch', () => {
    const one = initialState(34);
    advance(one, 600, strikesAt(0, 600, 4));

    const split = initialState(34);
    advance(split, 2.4, strikesAt(0, 600, 4));
    advance(split, 597.6, strikesAt(0, 600, 4));

    expect(serialize(split)).toBe(serialize(one));
  });
});
