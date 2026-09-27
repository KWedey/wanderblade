import { describe, expect, it } from 'vitest';
import {
  advance,
  affordableCount,
  ASC_NODES,
  ASC_NODE_IDS,
  ascNodeCost,
  buyHeroLevel,
  buySkill,
  buyAscendancyNode,
  bestBuy,
  enterPortal,
  nextBuy,
  heroDps,
  initialState,
  levelCost,
  pricedCount,
  purchaseOptions,
  serialize,
  SKILLS,
  SKILL_IDS,
  skillCost,
  type GameState,
  type PurchaseOption,
} from '../src/index';
import { clone, portalReady } from './helpers';

/** Execute `row` through the engine, so the shop's price and the charge agree. */
function buyFrom(s: GameState, row: PurchaseOption): boolean {
  if (row.kind === 'hero') return buyHeroLevel(s);
  if (row.kind === 'skill') return buySkill(s, row.id);
  return buyAscendancyNode(s, row.id);
}

describe('purchaseOptions', () => {
  it('lists every track exactly once, in a stable order', () => {
    const s = initialState(1);
    const rows = purchaseOptions(s);
    const ids = rows.map((r) => `${r.kind}:${r.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(purchaseOptions(initialState(2)).map((r) => `${r.kind}:${r.id}`));
    expect(rows.length).toBe(1 + SKILL_IDS.length + ASC_NODE_IDS.length);
  });

  it('prices the hero level by the engine formula', () => {
    const s = initialState(1);
    const hero = purchaseOptions(s).find((r) => r.kind === 'hero');
    expect(hero?.cost).toBeCloseTo(levelCost(s.hero.level, s.realm), 9);
  });

  it('prices every skill exactly as buySkill charges', () => {
    const s = initialState(1);
    s.hero.level = 999;
    s.gold = Infinity;
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'skill') continue;
      expect(row.cost).toBeCloseTo(skillCost(row.id, row.rank, s.realm), 9);
    }
  });

  it('prices every tree node exactly as buyAscendancyNode charges', () => {
    const s = initialState(1);
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'node') continue;
      expect(row.cost).toBe(ascNodeCost(row.id, row.rank));
    }
  });

  it('marks a skill locked below its unlock level and unlocked at it', () => {
    const gated = SKILL_IDS.map((id) => SKILLS[id]).filter((d) => d && d.unlockLevel > 0);
    expect(gated.length).toBeGreaterThan(0);
    const def = gated[0]!;
    const s = initialState(1);
    s.hero.level = def.unlockLevel - 1;
    expect(purchaseOptions(s).find((r) => r.id === def.id)?.unlocked).toBe(false);
    s.hero.level = def.unlockLevel;
    expect(purchaseOptions(s).find((r) => r.id === def.id)?.unlocked).toBe(true);
  });

  it('never calls a row affordable that the engine then refuses', () => {
    const s = initialState(1);
    s.hero.level = 40;
    s.gold = 5_000;
    s.ascendancy.banked = 40;
    // Each attempt runs from the same state: buying in sequence would drain the
    // currency the later rows were judged against.
    for (const row of purchaseOptions(s)) {
      if (!row.affordable) continue;
      expect(buyFrom(clone(s), row)).toBe(true);
    }
  });

  it('never calls a row affordable when its currency is short by a hair', () => {
    const s = initialState(1);
    s.hero.level = 40;
    s.gold = skillCost('cleave', 0, s.realm) - 1e-6;
    s.ascendancy.banked = 0;
    for (const row of purchaseOptions(s)) {
      if (row.kind === 'node') expect(row.affordable).toBe(false);
    }
  });

  it('still prices a tree node, however deep it is bought', () => {
    const s = initialState(1);
    s.ascendancy.banked = 1e12;
    for (const id of ASC_NODE_IDS) s.ascendancy.nodes[id] = 5_000;
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'node') continue;
      expect(row.unlocked).toBe(true);
      expect(row.affordable).toBe(true);
      expect(Number.isFinite(row.cost)).toBe(true);
    }
    expect(bestBuy(s, 'ascendancy')).not.toBeNull();
  });

  it('still prices a skill at every rank a realm can actually reach', () => {
    const s = initialState(1);
    s.hero.level = 999;
    // Where each price curve overflows is pinned in magnitude.test.ts.
    for (const id of SKILL_IDS) s.hero.skills[id] = 500;
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'skill') continue;
      expect(Number.isFinite(row.cost)).toBe(true);
      expect(row.cost).toBeGreaterThan(0);
    }
  });

  it('counts affordable as a subset of priced', () => {
    const s = initialState(1);
    s.gold = 1e9;
    s.hero.level = 30;
    expect(affordableCount(s)).toBeLessThanOrEqual(pricedCount(s));
  });

  it('shows the same rows during a guardian attempt, none of them affordable', () => {
    const s = portalReady(1, 60);
    s.gold = 1e12;
    s.ascendancy.banked = 1e6;
    const road = purchaseOptions(s).length;
    expect(enterPortal(s).entered).toBe(true);
    expect(purchaseOptions(s).length).toBe(road);
    for (const row of purchaseOptions(s)) {
      expect(row.affordable).toBe(false);
      expect(buyFrom(clone(s), row)).toBe(false);
    }
  });

  /**
   * A panel with nothing buyable on it is the one state the shop may never
   * render. Gold is zero the instant an ascension lands, so the guarantee is
   * about how long that lasts, not that it never happens.
   */
  it('puts an affordable row back on the panel within seconds of an ascension', () => {
    for (const realm of [0, 1, 5, 20, 60]) {
      const s = initialState(3);
      s.realm = realm;
      s.zone = 0;
      s.gold = 0;
      expect(affordableCount(s)).toBe(0);

      let elapsed = 0;
      while (elapsed < 300 && affordableCount(s) === 0) {
        advance(s, 1);
        elapsed += 1;
      }
      expect(affordableCount(s), `realm ${realm} stayed greyed`).toBeGreaterThan(0);
      expect(elapsed, `realm ${realm} took ${elapsed}s`).toBeLessThan(60);
    }
  });

  it('staggers the skill prices, so the cheap track is buyable long before the dear one', () => {
    const s = initialState(3);
    s.hero.level = 20;
    const costs = new Map(
      purchaseOptions(s)
        .filter((r) => r.kind === 'skill')
        .map((r) => [r.id, r.cost] as const),
    );
    const cheapest = Math.min(...costs.values());
    const dearest = Math.max(...costs.values());
    expect(cheapest * 5).toBeLessThan(dearest);

    // At the cheapest price exactly, the panel is not greyed but is not a
    // free-for-all either — which is what makes the row a decision.
    s.gold = cheapest;
    expect(affordableCount(s)).toBeGreaterThan(0);
    expect(affordableCount(s)).toBeLessThan(pricedCount(s));
  });
});

describe('valuePerCost is the one ranking of what to buy', () => {
  /** States across the whole curve — the ranking has to hold at every scale. */
  function states(): GameState[] {
    const out: GameState[] = [];
    for (const seed of [1, 7, 23]) {
      for (const seconds of [60, 3600, 86_400]) {
        const s = initialState(seed);
        advance(s, seconds);
        out.push(s);
      }
    }
    return out;
  }

  it('prices a rank by the DPS it actually adds', () => {
    for (const s of states()) {
      for (const row of purchaseOptions(s)) {
        // Priced on every unlocked row; only an affordable one can be executed.
        if (row.valuePerCost <= 0 || !row.affordable) continue;
        const before = heroDps(s);
        const after = clone(s);
        expect(buyFrom(after, row)).toBe(true);
        const gained = heroDps(after) - before;
        // Attack-speed nodes buy DPS the damage formula does not see, so the
        // check is directional for those and exact for the rest.
        if (row.kind === 'node' && ASC_NODES[row.id]?.effect === 'attackSpeed') {
          expect(row.valuePerCost).toBeGreaterThan(0);
        } else {
          expect(gained / row.cost).toBeCloseTo(row.valuePerCost, 6);
        }
      }
    }
  });

  it('names a best buy that is affordable, and the cheaper one on a tie', () => {
    for (const s of states()) {
      for (const currency of ['gold', 'ascendancy'] as const) {
        const best = bestBuy(s, currency);
        if (!best) continue;
        expect(best.affordable).toBe(true);
        expect(best.currency).toBe(currency);
        for (const row of purchaseOptions(s)) {
          if (row.currency !== currency || !row.affordable || row.valuePerCost <= 0) continue;
          expect(best.valuePerCost).toBeGreaterThanOrEqual(row.valuePerCost);
          if (row.valuePerCost === best.valuePerCost) {
            expect(best.cost).toBeLessThanOrEqual(row.cost);
          }
        }
      }
    }
  });

  it('offers nothing to spend when the wallet cannot cover a row', () => {
    const s = initialState(3);
    s.gold = 0;
    s.ascendancy.banked = 0;
    expect(bestBuy(s, 'gold')).toBeNull();
    expect(bestBuy(s, 'ascendancy')).toBeNull();
  });

  // A guardian attempt refuses every purchase, so the panel must not point at
  // a row the engine will reject.
  it('names no buy during a guardian attempt', () => {
    const s = portalReady(1, 0);
    enterPortal(s);
    expect(bestBuy(s, 'gold')).toBeNull();
  });
});

describe('nextBuy is bestBuy with the wallet ignored', () => {
  it('names the same row as bestBuy whenever that row is affordable', () => {
    for (const seed of [1, 7, 23]) {
      for (const seconds of [60, 3600, 86_400]) {
        const s = initialState(seed);
        advance(s, seconds);
        s.ascendancy.banked = 200;
        for (const currency of ['gold', 'ascendancy'] as const) {
          const best = bestBuy(s, currency);
          const next = nextBuy(s, currency);
          expect(next).not.toBeNull();
          expect(next?.currency).toBe(currency);
          expect(next?.unlocked).toBe(true);
          if (best && best.valuePerCost === next?.valuePerCost) {
            expect(next?.id).toBe(best.id);
          }
        }
      }
    }
  });

  it('still names a goal with an empty purse, and it is the row an unlimited purse would buy', () => {
    const s = initialState(3);
    advance(s, 3600);
    s.gold = 0;
    s.ascendancy.banked = 0;
    expect(bestBuy(s, 'gold')).toBeNull();
    for (const currency of ['gold', 'ascendancy'] as const) {
      const rich = clone(s);
      rich.gold = Infinity;
      rich.ascendancy.banked = Infinity;
      expect(nextBuy(s, currency)?.id).toBe(bestBuy(rich, currency)?.id);
      expect(nextBuy(s, currency)?.affordable).toBe(false);
    }
  });

  it('never names a locked skill, however much it would be worth', () => {
    const s = initialState(3);
    s.hero.level = 0;
    const next = nextBuy(s, 'gold');
    expect(next?.unlocked).toBe(true);
    for (const row of purchaseOptions(s)) {
      if (row.kind === 'skill' && !row.unlocked) expect(next?.id).not.toBe(row.id);
    }
  });

  it('keeps naming a goal during a guardian attempt, when nothing is buyable', () => {
    const s = portalReady(1, 0);
    s.gold = 1e12;
    enterPortal(s);
    expect(bestBuy(s, 'gold')).toBeNull();
    expect(nextBuy(s, 'gold')).not.toBeNull();
  });

  // Pure over state: no RNG draw, no clock read, so the same state names the
  // same goal on every call and on both sides of a save.
  it('is a pure function of state', () => {
    const s = initialState(5);
    advance(s, 7200);
    const before = serialize(s);
    const a = nextBuy(s, 'gold');
    const b = nextBuy(clone(s), 'gold');
    expect(serialize(s)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
