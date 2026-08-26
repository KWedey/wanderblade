import { describe, expect, it } from 'vitest';
import {
  advance,
  arcPositionAt,
  ARC_CATCH_MULT,
  arcCatchRadius,
  ARC_FLIGHT_SEC,
  ARC_STAGGER_SEC,
  ARC_SPLIT_MIN,
  ARC_SPLIT_MAX,
  arcSplitCount,
  speciesFor,
  arcsForKill,
  deserialize,
  enterPortal,
  initialState,
  serialize,
  summarizeEvents,
  type LootArc,
} from '../src/index';
import {
  aimAtOldestArc,
  clone,
  playActive,
  portalReady,
  roadAt,
  ROAD_KILL0_SEC,
  strikesAt,
} from './helpers';

function aimAt(arc: LootArc, atSec: number) {
  const p = arcPositionAt(arc, atSec);
  expect(p).not.toBeNull();
  return p;
}

// The contract that keeps idle honest: a kill credits full base gold the moment
// it lands, so an uncaught arc costs nothing. A catch pays only the increment.
describe('loot arcs', () => {
  it('leaves idle gold untouched — uncaught arcs still pay in full', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6); // one kill at the walking pace
    expect(s.lifetime.kills).toBe(1);
    // enemyGold(0, 0) = 1, scaled by what this kill happened to be
    expect(s.gold).toBeCloseTo(speciesFor(s.killIndex).goldMult, 10);
    expect(s.arcs).toHaveLength(arcSplitCount(s.killIndex));

    const paidOnKill = s.gold;
    advance(s, ARC_FLIGHT_SEC + 2); // every coin lands uncaught
    // Gold is credited on the kill, so a coin hitting the ground claws nothing back.
    expect(s.gold).toBeGreaterThanOrEqual(paidOnKill);
  });

  it('splits a kill into coins whose values sum to the payout exactly', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6);
    const paid = s.gold;
    expect(s.arcs.length).toBe(arcSplitCount(s.killIndex));
    expect(s.arcs.length).toBeGreaterThan(1);
    // Exactly, not closely: the last coin carries the residual, so the split
    // can neither mint nor lose a fraction of a payout.
    const summed = s.arcs.reduce((t, a) => t + a.gold, 0);
    expect(summed).toBe(paid);
  });

  it('staggers the coins of a kill so they leave one after another', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6);
    for (let i = 1; i < s.arcs.length; i++) {
      const prev = s.arcs[i - 1] as LootArc;
      const here = s.arcs[i] as LootArc;
      expect(here.expiresAtSec - prev.expiresAtSec).toBeCloseTo(ARC_STAGGER_SEC, 10);
      expect(here.landingX).not.toBe(prev.landingX);
    }
  });

  it('pays the catch increment on one coin, leaving the rest of the kill in the air', () => {
    const s = initialState(31);
    advance(s, ROAD_KILL0_SEC + 1e-6);
    const afterKill = s.gold;
    const coins = s.arcs.length;
    expect(coins).toBeGreaterThan(1);
    const target = s.arcs[0] as LootArc;

    const at = 1.5 * ROAD_KILL0_SEC;
    const events = advance(s, ROAD_KILL0_SEC / 2, [
      { atSec: at, aim: aimAt(target, at) },
    ]);
    const catches = events.filter((e) => e.type === 'arcCatch');
    expect(catches).toHaveLength(1);
    // The increment is that coin's share, not the whole kill's — which is what
    // makes a partial catch possible.
    expect(catches[0]).toMatchObject({ bonusGold: target.gold * (ARC_CATCH_MULT - 1) });
    expect(s.gold).toBeCloseTo(afterKill + target.gold * (ARC_CATCH_MULT - 1), 10);
  });

  it('pays the full kill increment only when every coin is caught', () => {
    const s = roadAt(31, 20, 10);
    advance(s, 10.001);
    const afterKill = s.gold;
    const coins = [...s.arcs];
    expect(coins.length).toBeGreaterThan(1);

    let events: ReturnType<typeof advance> = [];
    for (const coin of coins) {
      const at = coin.expiresAtSec - ARC_FLIGHT_SEC / 2;
      events = events.concat(advance(s, Math.max(1e-9, at - s.timeSec + 1e-9), [
        { atSec: at, aim: aimAt(coin, at) },
      ]));
    }
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(coins.length);
    const kill = coins.reduce((t, a) => t + a.gold, 0);
    expect(s.gold).toBeCloseTo(afterKill + kill * (ARC_CATCH_MULT - 1), 6);
  });

  it('cannot catch an arc that has already landed', () => {
    // A slow zone, so the arc expires long before the next kill spawns another.
    const s = roadAt(31, 20, 10);
    advance(s, 10.001);
    const afterKill = s.gold;
    const arc = s.arcs[0] as LootArc;
    const stale = arcPositionAt(arc, 10 + ARC_FLIGHT_SEC / 2) as { x: number; y: number };
    const events = advance(s, 3, [{ atSec: 10 + ARC_FLIGHT_SEC + 0.05, aim: stale }]);
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.gold).toBe(afterKill);
  });

  it('never spawns or catches arcs during the boss phase', () => {
    const s = portalReady(32, 4 * 3600);
    enterPortal(s);
    expect(s.arcs).toEqual([]);
    const events = advance(s, 600, strikesAt(s.timeSec, 600, 4, { x: 0.5, y: 1 }));
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.arcs).toEqual([]);
  });

  it('counts catch gold in the recap', () => {
    const s = initialState(33);
    const goldBefore = s.gold;
    const events: ReturnType<typeof advance> = [];
    const end = 900;
    const step = 0.25;
    for (let t = step; t <= end + 1e-9; t += step) {
      events.push(...advance(s, t - s.timeSec, [{ atSec: t, aim: aimAtOldestArc(s, t) }]));
    }
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
      let count = 0;
      const step = 0.25;
      for (let t = step; t <= 4000 + 1e-9; t += step) {
        const ev = advance(s, t - s.timeSec, [{ atSec: t, aim: aimAtOldestArc(s, t) }]);
        count += ev.filter((e) => e.type === 'arcCatch' && e.upgraded).length;
      }
      upgraded += count;
    }
    expect(upgraded).toBeGreaterThan(0);
  });

  it('is byte-identical under a split advance that lands between arc and catch', () => {
    const strikes = strikesAt(0, 600, 4, { x: 0.5, y: 1 });
    const one = initialState(34);
    advance(one, 600, strikes);

    const split = initialState(34);
    advance(split, 2.4, strikes);
    advance(split, 597.6, strikes);

    expect(serialize(split)).toBe(serialize(one));
  });
});

// Position, not order, decides a catch (docs/DECISIONS.md #25).
describe('a catch is a hit test, not a queue', () => {
  it('catches the arc the strike is aimed at, not the oldest one', () => {
    const s = initialState(31);
    advance(s, 4.001);
    expect(s.arcs.length).toBeGreaterThanOrEqual(3);

    const at = 4.05;
    const target = s.arcs[2] as LootArc;
    const targetGold = target.gold;
    const before = s.gold;
    const events = advance(s, 0.1, [{ atSec: at, aim: aimAt(target, at) }]);

    const catches = events.filter((e) => e.type === 'arcCatch');
    expect(catches).toHaveLength(1);
    expect(s.gold - before).toBeCloseTo(targetGold * (ARC_CATCH_MULT - 1), 10);
    expect(s.arcs).not.toContain(target);
  });

  it('catches nothing when aimed away from every live arc', () => {
    const s = initialState(31);
    advance(s, 4.001);
    expect(s.arcs.length).toBeGreaterThanOrEqual(2);

    const goldBefore = s.gold;
    const momentumBefore = s.momentum.value;
    const events = advance(s, 0.1, [{ atSec: 4.05, aim: { x: 40, y: 40 } }]);

    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.gold).toBe(goldBefore); // no catch, and no kill fell in the window
    // The swing and the momentum still land — a miss is a valid strike.
    expect(s.momentum.value).toBeGreaterThan(momentumBefore);
  });

  it('catches nothing when the strike carries no aim at all', () => {
    const s = initialState(31);
    advance(s, 4.001);
    const momentumBefore = s.momentum.value;
    const events = advance(s, 0.1, [{ atSec: 4.05, aim: null }]);

    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(s.momentum.value).toBeGreaterThan(momentumBefore);
  });

  it('misses just outside the catch radius and hits just inside it', () => {
    const s = roadAt(31, 20, 10);
    advance(s, 10.001);
    const at = 10.5;
    const arc = s.arcs[0] as LootArc;
    const p = aimAt(arc, at) as { x: number; y: number };
    const r = arcCatchRadius(arc, at);
    expect(r).toBeGreaterThan(0);

    const near = advance(clone(s), 0.6, [
      { atSec: at, aim: { x: p.x + r * 0.9, y: p.y } },
    ]);
    expect(near.filter((e) => e.type === 'arcCatch')).toHaveLength(1);

    const far = advance(clone(s), 0.6, [
      { atSec: at, aim: { x: p.x + r * 1.1, y: p.y } },
    ]);
    expect(far.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
  });

  it('treats an arc with no recorded reach as uncatchable, never as NaN', () => {
    const s = roadAt(31, 20, 10);
    advance(s, 10.001);
    const arc = s.arcs[0] as LootArc;
    const at = 10.5;
    const p = aimAt(arc, at) as { x: number; y: number };

    // A save written before arcs carried a reach round-trips into this shape.
    delete (arc as Partial<LootArc>).landingX;
    expect(arcPositionAt(arc, at)).toBeNull();

    const events = advance(s, 0.6, [{ atSec: at, aim: p }]);
    expect(events.filter((e) => e.type === 'arcCatch')).toHaveLength(0);
    expect(Number.isFinite(s.gold)).toBe(true);
  });

  it('gives every arc in flight together a distinct place to be', () => {
    const s = initialState(31);
    advance(s, 4.001);
    const seen = new Set(s.arcs.map((a) => a.landingX));
    expect(seen.size).toBe(s.arcs.length);
  });

  it('is byte-identical for identical aimed inputs, however the advance splits', () => {
    const build = (seed: number) => {
      const st = initialState(seed);
      const out = [];
      for (let t = 0.25; t <= 300 + 1e-9; t += 0.25) {
        out.push({ atSec: t, aim: aimAtOldestArc(st, t) });
        advance(st, t - st.timeSec, []);
      }
      return out;
    };
    const strikes = build(35);

    const one = initialState(35);
    advance(one, 300, strikes);

    const split = initialState(35);
    advance(split, 1, strikes);
    advance(split, 123.5, strikes);
    advance(split, 175.5, strikes);

    expect(serialize(split)).toBe(serialize(one));
  });
});

describe('perfect aim beats no aim', () => {
  it('earns more gold at the same strike rate', () => {
    const blind = initialState(37);
    advance(blind, 600, strikesAt(0, 600, 4, null));

    const aimed = initialState(37);
    playActive(aimed, 600, 4);

    expect(aimed.gold).toBeGreaterThan(blind.gold);
  });

  it('derives the split from the kill index alone, with no RNG draw', () => {
    // Same kill index, same shape, whatever the payout or the clock — the
    // renderer cannot influence it and the kill-keyed stream is untouched.
    for (const k of [0, 1, 2, 7, 41, 1_000_003]) {
      const a = arcsForKill(k, 100, 0);
      const b = arcsForKill(k, 100, 0);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));

      const scaled = arcsForKill(k, 7, 12.5);
      expect(scaled).toHaveLength(a.length);
      expect(scaled.map((x) => x.landingX)).toEqual(a.map((x) => x.landingX));
    }
  });

  it('sums coin values to the payout exactly across many kills and magnitudes', () => {
    for (const gold of [1, 3, 7, 0.1, 1e-9, 12_345.678, 1e18, 1e200]) {
      for (let k = 0; k < 200; k++) {
        const coins = arcsForKill(k, gold, 0);
        const summed = coins.reduce((t, c) => t + c.gold, 0);
        expect(summed).toBe(gold);
        for (const c of coins) expect(Number.isFinite(c.gold)).toBe(true);
      }
    }
  });

  it('keeps every coin count inside its bounds and every reach distinct', () => {
    for (let k = 0; k < 5_000; k++) {
      const n = arcSplitCount(k);
      expect(n).toBeGreaterThanOrEqual(ARC_SPLIT_MIN);
      expect(n).toBeLessThanOrEqual(ARC_SPLIT_MAX);
      const reaches = arcsForKill(k, 10, 0).map((c) => c.landingX);
      expect(new Set(reaches).size).toBe(n);
    }
  });

  it('a split kill survives a save round-trip unchanged', () => {
    const s = initialState(31);
    advance(s, 4.001);
    expect(s.arcs.length).toBeGreaterThan(1);
    const restored = deserialize(serialize(s));
    expect(serialize(restored)).toBe(serialize(s));
    expect(restored.arcs).toEqual(s.arcs);
  });
});
