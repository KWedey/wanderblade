import { describe, expect, it } from 'vitest';
import {
  advance,
  arcPositionAt,
  ARC_CATCH_MULT,
  ARC_CATCH_RADIUS,
  ARC_FLIGHT_SEC,
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

    const at = 1.5 * ROAD_KILL0_SEC;
    const events = advance(s, ROAD_KILL0_SEC / 2, [
      { atSec: at, aim: aimAt(s.arcs[0] as LootArc, at) },
    ]);
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
    const p = aimAt(s.arcs[0] as LootArc, at) as { x: number; y: number };

    const near = advance(clone(s), 0.6, [
      { atSec: at, aim: { x: p.x + ARC_CATCH_RADIUS * 0.9, y: p.y } },
    ]);
    expect(near.filter((e) => e.type === 'arcCatch')).toHaveLength(1);

    const far = advance(clone(s), 0.6, [
      { atSec: at, aim: { x: p.x + ARC_CATCH_RADIUS * 1.1, y: p.y } },
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
});
