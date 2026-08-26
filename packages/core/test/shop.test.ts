import { describe, expect, it } from 'vitest';
import {
  affordableCount,
  ASC_NODE_IDS,
  ASC_NODES,
  ascNodeCost,
  buyHeroLevel,
  buySkill,
  buyAscendancyNode,
  enterPortal,
  initialState,
  levelCost,
  pricedCount,
  purchaseOptions,
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

  it('reports the hero level as uncapped and priced by the engine formula', () => {
    const s = initialState(1);
    const hero = purchaseOptions(s).find((r) => r.kind === 'hero');
    expect(hero?.maxRank).toBeNull();
    expect(hero?.atMax).toBe(false);
    expect(hero?.cost).toBeCloseTo(levelCost(s.hero.level, s.realm), 9);
  });

  it('prices every skill exactly as buySkill charges', () => {
    const s = initialState(1);
    s.hero.level = 999;
    s.gold = Infinity;
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'skill' || row.atMax) continue;
      expect(row.cost).toBeCloseTo(skillCost(row.rank, s.realm), 9);
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
    if (gated.length === 0) return;
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
    s.gold = skillCost(0, s.realm) - 1e-6;
    s.ascendancy.banked = 0;
    for (const row of purchaseOptions(s)) {
      if (row.kind === 'node') expect(row.affordable).toBe(false);
    }
  });

  it('reports a capped tree node as atMax with no finite price', () => {
    const s = initialState(1);
    s.ascendancy.banked = 1e12;
    const id = ASC_NODE_IDS[0]!;
    s.ascendancy.nodes[id] = ASC_NODES[id]!.maxRank;
    const row = purchaseOptions(s).find((r) => r.id === id);
    expect(row?.atMax).toBe(true);
    expect(Number.isFinite(row?.cost ?? Infinity)).toBe(false);
    expect(row?.affordable).toBe(false);
  });

  it('never reports a skill as maxed, however many ranks are bought', () => {
    const s = initialState(1);
    s.hero.level = 999;
    for (const id of SKILL_IDS) s.hero.skills[id] = 5_000;
    for (const row of purchaseOptions(s)) {
      if (row.kind !== 'skill') continue;
      expect(row.atMax).toBe(false);
      expect(row.maxRank).toBeNull();
      expect(Number.isFinite(row.cost)).toBe(true);
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
      expect(buyFrom(clone(s), row)).toBe(false);
    }
  });
});
