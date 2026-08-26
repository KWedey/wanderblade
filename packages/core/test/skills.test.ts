import { describe, expect, it } from 'vitest';
import {
  advance,
  ASC_NODE_IDS,
  buyHeroLevel,
  buySkill,
  enterPortal,
  heroDps,
  initialState,
  levelCost,
  skillCost,
  SKILL_IDS,
  skillMult,
  skillRankMult,
  SKILL_MAX_BONUS,
  SKILLS,
} from '../src/index';
import { portalReady } from './helpers';

describe('buyHeroLevel', () => {
  it('deducts gold and raises level when affordable', () => {
    const s = initialState(1);
    s.gold = 100;
    expect(buyHeroLevel(s)).toBe(true);
    expect(s.hero.level).toBe(1);
    expect(s.gold).toBeCloseTo(100 - levelCost(0, 0), 6);
  });

  it('is a no-op when unaffordable', () => {
    const s = initialState(1);
    s.gold = 5; // < levelCost(0, 0) = 10
    expect(buyHeroLevel(s)).toBe(false);
    expect(s.hero.level).toBe(0);
    expect(s.gold).toBe(5);
  });

  it('charges the realm-scaled cost in a later realm', () => {
    const s = initialState(1);
    s.realm = 2;
    s.gold = levelCost(0, 2);
    expect(buyHeroLevel(s)).toBe(true);
    expect(s.gold).toBeCloseTo(0, 6);
    expect(buyHeroLevel(s)).toBe(false);
  });

  it('increases hero DPS', () => {
    const s = initialState(1);
    s.gold = 1000;
    const before = heroDps(s);
    buyHeroLevel(s);
    expect(heroDps(s)).toBeGreaterThan(before);
  });
});

describe('buySkill unlock gates', () => {
  it('opens at least two skills at hero level 0, so minute one has real choice', () => {
    const atZero = SKILL_IDS.filter((id) => SKILLS[id]?.unlockLevel === 0);
    expect(atZero.length).toBeGreaterThanOrEqual(2);
  });

  it('opens every skill inside the first stretch of a realm', () => {
    for (const id of SKILL_IDS) {
      expect(SKILLS[id]!.unlockLevel).toBeLessThanOrEqual(20);
    }
  });

  it('rejects an unknown skill id', () => {
    const s = initialState(1);
    s.gold = 1e9;
    expect(buySkill(s, 'nope')).toBe(false);
  });

  it('gates every skill exactly at its unlock level', () => {
    for (const id of SKILL_IDS) {
      const def = SKILLS[id]!;
      const s = initialState(1);
      s.gold = 1e9;
      if (def.unlockLevel > 0) {
        s.hero.level = def.unlockLevel - 1;
        expect(buySkill(s, id)).toBe(false);
        expect(s.hero.skills[id]).toBe(0);
      }
      s.hero.level = def.unlockLevel;
      expect(buySkill(s, id)).toBe(true);
      expect(s.hero.skills[id]).toBe(1);
    }
  });

  it('charges the skill cost curve and is a no-op when unaffordable', () => {
    const s = initialState(1);
    s.hero.level = 20;
    s.gold = skillCost(0, 0); // exactly 50
    expect(buySkill(s, 'cleave')).toBe(true);
    expect(s.gold).toBeCloseTo(0, 6);
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(s.hero.skills.cleave).toBe(1);
  });

  it('each rank multiplies DPS by skillRankMult(rank)', () => {
    const s = initialState(1);
    s.hero.level = 5;
    s.gold = 1e9;
    const base = heroDps(s);
    buySkill(s, 'cleave');
    expect(heroDps(s)).toBeCloseTo(base * skillRankMult(1), 8);
    buySkill(s, 'cleave');
    expect(heroDps(s)).toBeCloseTo(base * skillRankMult(2), 8);
  });
});

describe('skill ranks are uncapped, and the asymptote is what bounds them', () => {
  it('never refuses a rank for being too high, only for gold', () => {
    const s = initialState(1);
    s.hero.level = 20;
    s.gold = 1e18;
    for (let i = 0; i < 200; i++) expect(buySkill(s, 'cleave')).toBe(true);
    expect(s.hero.skills.cleave).toBe(200);

    s.gold = 0;
    const rankAtBroke = s.hero.skills.cleave;
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(s.hero.skills.cleave).toBe(rankAtBroke);
  });

  it('holds skillMult under the ceiling however much gold is poured in', () => {
    const s = initialState(1);
    s.hero.level = 20;
    s.gold = 1e18;
    for (const id of SKILL_IDS) for (let i = 0; i < 300; i++) buySkill(s, id);
    const ceiling = Math.pow(1 + SKILL_MAX_BONUS, SKILL_IDS.length);
    expect(skillMult(s.hero.skills)).toBeLessThan(ceiling);
  });

  it('charges the rising price for every rank, so gold strictly falls', () => {
    const s = initialState(1);
    s.hero.level = 20;
    s.gold = 1e12;
    let prev = s.gold;
    let prevSpend = 0;
    for (let i = 0; i < 30; i++) {
      expect(buySkill(s, 'warcry')).toBe(true);
      const spend = prev - s.gold;
      expect(spend).toBeGreaterThan(prevSpend);
      prevSpend = spend;
      prev = s.gold;
    }
  });
});

describe('the id lists are what a fresh and a post-ascension state are built from', () => {
  it('gives a fresh state a rank-0 entry for every skill and every tree node', () => {
    const s = initialState(1);
    expect(Object.keys(s.hero.skills).sort()).toEqual([...SKILL_IDS].sort());
    expect(Object.keys(s.ascendancy.nodes).sort()).toEqual([...ASC_NODE_IDS].sort());
    expect(Object.values(s.hero.skills).every((r) => r === 0)).toBe(true);
    expect(Object.values(s.ascendancy.nodes).every((r) => r === 0)).toBe(true);
  });

  it('rebuilds the same skill map on ascension, keeping the tree untouched', () => {
    const s = portalReady(41, 600);
    s.hero.level = 20;
    for (const id of SKILL_IDS) s.hero.skills[id] = 3;
    enterPortal(s);
    advance(s, 3600);
    expect(s.lifetime.ascensions).toBe(1);
    expect(Object.keys(s.hero.skills).sort()).toEqual([...SKILL_IDS].sort());
    expect(Object.values(s.hero.skills).every((r) => r === 0)).toBe(true);
    expect(Object.keys(s.ascendancy.nodes).sort()).toEqual([...ASC_NODE_IDS].sort());
  });
});
