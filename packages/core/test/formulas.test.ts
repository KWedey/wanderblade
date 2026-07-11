import { describe, it, expect } from 'vitest';
import {
  enemyHp,
  enemyGold,
  bossHp,
  levelCost,
  skillCost,
  heroBaseDamage,
  skillMult,
  gearPowerTotal,
  heroDps,
  bossZoneOf,
  readiness,
  initialState,
  enrageWindowSec,
  d0,
  bossHpMult,
  skillMultPerLevel,
} from '../src/index';
import type { GameState } from '../src/index';

// Values are checked directly against docs/ECONOMY.md "Core formulas (v0)".
describe('enemy formulas', () => {
  it('enemyHp(z) = 10 * 1.55^z', () => {
    expect(enemyHp(0)).toBeCloseTo(10, 10);
    expect(enemyHp(1)).toBeCloseTo(15.5, 10);
    expect(enemyHp(2)).toBeCloseTo(24.025, 10);
    expect(enemyHp(5)).toBeCloseTo(10 * 1.55 ** 5, 8);
  });

  it('enemyGold(z) = 1 * 1.48^z (income grows slower than HP)', () => {
    expect(enemyGold(0)).toBeCloseTo(1, 10);
    expect(enemyGold(1)).toBeCloseTo(1.48, 10);
    expect(enemyGold(10)).toBeCloseTo(1.48 ** 10, 8);
    // difficulty outruns income
    expect(enemyHp(10) / enemyHp(0)).toBeGreaterThan(enemyGold(10) / enemyGold(0));
  });

  it('bossHp(z) = bossHpMult * hp(z)', () => {
    expect(bossHp(0)).toBeCloseTo(bossHpMult * 10, 10);
    expect(bossHp(9)).toBeCloseTo(bossHpMult * enemyHp(9), 6);
  });
});

describe('cost formulas', () => {
  it('levelCost(level) = 10 * 1.15^level', () => {
    expect(levelCost(0)).toBeCloseTo(10, 10);
    expect(levelCost(1)).toBeCloseTo(11.5, 10);
    expect(levelCost(10)).toBeCloseTo(10 * 1.15 ** 10, 8);
  });

  it('skillCost(skillLevel) = 50 * 1.15^skillLevel', () => {
    expect(skillCost(0)).toBeCloseTo(50, 10);
    expect(skillCost(1)).toBeCloseTo(57.5, 10);
    expect(skillCost(5)).toBeCloseTo(50 * 1.15 ** 5, 8);
  });
});

describe('hero damage model', () => {
  it('heroBaseDamage(level) = d0 * 1.12^level', () => {
    expect(heroBaseDamage(0)).toBeCloseTo(d0, 10);
    expect(heroBaseDamage(1)).toBeCloseTo(d0 * 1.12, 10);
    expect(heroBaseDamage(20)).toBeCloseTo(d0 * 1.12 ** 20, 8);
  });

  it('skillMult = product of (1 + skillMultPerLevel * level); level-0 skills are neutral', () => {
    const f = (level: number) => 1 + skillMultPerLevel * level;
    expect(skillMult({ cleave: 0, warcry: 0 })).toBeCloseTo(1, 10);
    expect(skillMult({ cleave: 2, warcry: 0 })).toBeCloseTo(f(2), 10);
    expect(skillMult({ cleave: 2, warcry: 4 })).toBeCloseTo(f(2) * f(4), 10);
  });

  it('gearPowerTotal sums the three slots, treating empty as 0', () => {
    expect(gearPowerTotal({ weapon: null, armor: null, trinket: null })).toBe(0);
    expect(
      gearPowerTotal({
        weapon: { power: 10, rarity: 'common', zone: 0 },
        armor: null,
        trinket: { power: 5, rarity: 'rare', zone: 1 },
      }),
    ).toBeCloseTo(15, 10);
  });

  it('heroDps = (base + gear) * skillMult * (1 + mastery); initial is d0', () => {
    const s = initialState(1);
    expect(heroDps(s)).toBeCloseTo(d0, 10);

    const g: GameState = initialState(1);
    g.hero.level = 3;
    g.hero.skills.cleave = 2; // requires unlock in gameplay, but formula is pure
    g.gear.weapon = { power: 40, rarity: 'common', zone: 0 };
    const expected = (d0 * 1.12 ** 3 + 40) * (1 + skillMultPerLevel * 2);
    expect(heroDps(g)).toBeCloseTo(expected, 8);
  });
});

describe('gate readiness', () => {
  it('bossZoneOf returns the region-final zone', () => {
    expect(bossZoneOf(0)).toBe(9);
    expect(bossZoneOf(9)).toBe(9);
    expect(bossZoneOf(15)).toBe(19);
    expect(bossZoneOf(69)).toBe(69);
    expect(bossZoneOf(70)).toBe(79);
  });

  it('readiness = (dps * 30) / bossHp(bossZone)', () => {
    const s = initialState(1);
    s.zone = 9;
    s.gear.weapon = { power: 100, rarity: 'common', zone: 9 };
    const expected = (heroDps(s) * enrageWindowSec) / bossHp(9);
    expect(readiness(s)).toBeCloseTo(expected, 10);
  });
});
