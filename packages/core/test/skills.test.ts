import { describe, expect, it } from 'vitest';
import {
  buyHeroLevel,
  buySkill,
  heroDps,
  initialState,
  levelCost,
  skillCost,
  skillMult,
  skillMultPerLevel,
  SKILLS,
} from '../src/index';

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
  it('defines the v1 skills at the spec unlock levels', () => {
    expect(SKILLS.cleave?.unlockLevel).toBe(5);
    expect(SKILLS.warcry?.unlockLevel).toBe(15);
  });

  it('rejects an unknown skill id', () => {
    const s = initialState(1);
    s.gold = 1e9;
    expect(buySkill(s, 'nope')).toBe(false);
  });

  it('cannot buy cleave before hero level 5', () => {
    const s = initialState(1);
    s.gold = 1e9;
    s.hero.level = 4;
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(s.hero.skills.cleave).toBe(0);

    s.hero.level = 5;
    expect(buySkill(s, 'cleave')).toBe(true);
    expect(s.hero.skills.cleave).toBe(1);
  });

  it('cannot buy warcry before hero level 15', () => {
    const s = initialState(1);
    s.gold = 1e9;
    s.hero.level = 14;
    expect(buySkill(s, 'warcry')).toBe(false);

    s.hero.level = 15;
    expect(buySkill(s, 'warcry')).toBe(true);
    expect(s.hero.skills.warcry).toBe(1);
  });

  it('charges the skill cost curve and is a no-op when unaffordable', () => {
    const s = initialState(1);
    s.hero.level = 5;
    s.gold = skillCost(0, 0); // exactly 50
    expect(buySkill(s, 'cleave')).toBe(true);
    expect(s.gold).toBeCloseTo(0, 6);
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(s.hero.skills.cleave).toBe(1);
  });

  it('each rank multiplies DPS by (1 + skillMultPerLevel * rank)', () => {
    const s = initialState(1);
    s.hero.level = 5;
    s.gold = 1e9;
    const base = heroDps(s);
    buySkill(s, 'cleave');
    expect(heroDps(s)).toBeCloseTo(base * (1 + skillMultPerLevel), 8);
    buySkill(s, 'cleave');
    expect(heroDps(s)).toBeCloseTo(base * (1 + skillMultPerLevel * 2), 8);
  });
});

describe('buySkill hard cap (bounded multiplier)', () => {
  it('refuses to buy past maxLevel and spends no gold at the cap', () => {
    const s = initialState(1);
    s.hero.level = 15;
    s.gold = 1e12;
    const cap = SKILLS.cleave!.maxLevel;
    for (let i = 0; i < cap; i++) expect(buySkill(s, 'cleave')).toBe(true);
    expect(s.hero.skills.cleave).toBe(cap);

    const goldAtCap = s.gold;
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(s.hero.skills.cleave).toBe(cap);
    expect(s.gold).toBe(goldAtCap);
  });

  it('bounds skillMult at a fixed, finite ceiling', () => {
    const s = initialState(1);
    s.hero.level = 15;
    s.gold = 1e12;
    const capC = SKILLS.cleave!.maxLevel;
    const capW = SKILLS.warcry!.maxLevel;
    for (let i = 0; i < capC; i++) buySkill(s, 'cleave');
    for (let i = 0; i < capW; i++) buySkill(s, 'warcry');
    expect(skillMult(s.hero.skills)).toBeCloseTo(
      (1 + skillMultPerLevel * capC) * (1 + skillMultPerLevel * capW),
      10,
    );
    expect(1 + skillMultPerLevel * capC).toBeCloseTo(1.5, 10);
  });
});
