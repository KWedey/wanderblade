import { describe, expect, it } from 'vitest';
import {
  ascBonus,
  ascendancyBossPayout,
  ascendancyPerZone,
  ascNodeCost,
  ascSpeedMultiplier,
  ASC_BOSS_PAYOUT,
  ASC_NODES,
  ASC_PER_ZONE,
  ASC_REALM_GROWTH,
  attackSpeedMultiplier,
  BOSS_REALM_GAIN,
  bossEtaSec,
  bossHp,
  bossHpMult,
  bossSwingSec,
  d0,
  damagePerSwing,
  earningsMultiplier,
  EARNINGS_BONUS_PER_VICTORY,
  enemyGold,
  enemyHp,
  gearPower,
  gearPowerTotal,
  goldPerKill,
  heroBaseDamage,
  heroDps,
  initialState,
  levelCost,
  realmScale,
  REALM_STEP,
  skillCost,
  skillMult,
  skillRankMult,
  SKILL_IDS,
  SKILL_MAX_BONUS,
  swingInterval,
  zonesPerRealm,
} from '../src/index';

describe('realm scaling', () => {
  it('multiplies every gold and power quantity by REALM_STEP^realm', () => {
    expect(realmScale(0)).toBe(1);
    expect(realmScale(3)).toBeCloseTo(REALM_STEP ** 3, 6);
    for (const r of [1, 2, 5]) {
      expect(enemyHp(r, 4) / enemyHp(0, 4)).toBeCloseTo(realmScale(r), 6);
      expect(enemyGold(r, 4) / enemyGold(0, 4)).toBeCloseTo(realmScale(r), 6);
      expect(levelCost(7, r) / levelCost(7, 0)).toBeCloseTo(realmScale(r), 6);
      expect(skillCost(3, r) / skillCost(3, 0)).toBeCloseTo(realmScale(r), 6);
      expect(gearPower(r, 4, 'rare') / gearPower(0, 4, 'rare')).toBeCloseTo(realmScale(r), 6);
    }
  });
});

describe('enemy formulas', () => {
  it('enemyHp(0, z) = 10 * 1.55^z', () => {
    expect(enemyHp(0, 0)).toBeCloseTo(10, 10);
    expect(enemyHp(0, 1)).toBeCloseTo(15.5, 10);
    expect(enemyHp(0, 2)).toBeCloseTo(24.025, 10);
  });

  it('enemyGold(0, z) = 1.48^z, growing slower than HP', () => {
    expect(enemyGold(0, 0)).toBeCloseTo(1, 10);
    expect(enemyGold(0, 1)).toBeCloseTo(1.48, 10);
    expect(enemyHp(0, 10) / enemyHp(0, 0)).toBeGreaterThan(
      enemyGold(0, 10) / enemyGold(0, 0),
    );
  });

  it("bossHp scales off the realm's final-zone enemy", () => {
    expect(bossHp(0)).toBeCloseTo(bossHpMult * enemyHp(0, zonesPerRealm - 1), 4);
    // Guardians rubber-band a little ahead of their realm (DECISIONS.md #23).
    expect(bossHp(2) / bossHp(0)).toBeCloseTo(realmScale(2) * BOSS_REALM_GAIN ** 2, 6);
    expect(bossHp(2) / bossHp(0)).toBeGreaterThan(realmScale(2));
  });
});

describe('cost formulas', () => {
  it('levelCost(level, 0) = 10 * 1.15^level', () => {
    expect(levelCost(0, 0)).toBeCloseTo(10, 10);
    expect(levelCost(1, 0)).toBeCloseTo(11.5, 10);
  });

  it('skillCost(rank, 0) = 50 * 1.15^rank', () => {
    expect(skillCost(0, 0)).toBeCloseTo(50, 10);
    expect(skillCost(1, 0)).toBeCloseTo(57.5, 10);
  });

  it('ascNodeCost follows the node curve and is Infinity at the cap', () => {
    const def = ASC_NODES.edge!;
    expect(ascNodeCost('edge', 0)).toBeCloseTo(def.costBase, 10);
    expect(ascNodeCost('edge', 2)).toBeCloseTo(def.costBase * def.costRate ** 2, 8);
    expect(ascNodeCost('edge', def.maxRank)).toBe(Infinity);
    expect(ascNodeCost('nope', 0)).toBe(Infinity);
  });
});

describe('hero damage model', () => {
  it('heroBaseDamage(level, 0) = d0 * 1.12^level', () => {
    expect(heroBaseDamage(0, 0)).toBeCloseTo(d0, 10);
    expect(heroBaseDamage(1, 0)).toBeCloseTo(d0 * 1.12, 10);
  });

  it('skillMult is the product of skillRankMult; rank 0 is neutral', () => {
    expect(skillMult({ cleave: 0, warcry: 0 })).toBeCloseTo(1, 10);
    expect(skillMult({ cleave: 2, warcry: 4 })).toBeCloseTo(
      skillRankMult(2) * skillRankMult(4),
      10,
    );
  });

  it('skillRankMult rises with rank and never exceeds 1 + SKILL_MAX_BONUS', () => {
    expect(skillRankMult(0)).toBe(1);
    // Strictly increasing over the ranks a realm actually reaches. Past the
    // point where the decay term underflows to zero it sits exactly on the
    // asymptote, so the durable bound is "never exceeds", not "never reaches".
    for (let r = 1; r <= 60; r++) {
      expect(skillRankMult(r)).toBeGreaterThan(skillRankMult(r - 1));
    }
    for (let r = 1; r < 2000; r++) {
      expect(skillRankMult(r)).toBeGreaterThanOrEqual(skillRankMult(r - 1));
      expect(skillRankMult(r)).toBeLessThanOrEqual(1 + SKILL_MAX_BONUS);
    }
    expect(skillRankMult(1e6)).toBe(1 + SKILL_MAX_BONUS);
  });

  it('bounds skillMult at the ceiling no matter how many ranks are bought', () => {
    const ceiling = Math.pow(1 + SKILL_MAX_BONUS, SKILL_IDS.length);
    const maxed: Record<string, number> = {};
    for (const id of SKILL_IDS) maxed[id] = 1e6;
    expect(skillMult(maxed)).toBeLessThanOrEqual(ceiling * (1 + 1e-12));
    expect(skillMult(maxed)).toBeGreaterThan(ceiling * 0.999);
  });

  it('walks SKILL_IDS, so key order and stray keys cannot move the product', () => {
    // JSON round-trips preserve insertion order, so a hand-edited or older save
    // can hand skillMult the same ranks in a different order.
    const forward = skillMult({ cleave: 3, warcry: 7 });
    expect(skillMult({ warcry: 7, cleave: 3 })).toBe(forward);
    expect(skillMult({ cleave: 3, warcry: 7, ghost: 9 })).toBe(forward);
    // A skill the state never recorded counts as rank 0, not as absent.
    expect(skillMult({ cleave: 3 })).toBe(skillMult({ cleave: 3, warcry: 0 }));
  });

  it('gearPowerTotal sums the three slots, treating empty as 0', () => {
    expect(gearPowerTotal({ weapon: null, armor: null, trinket: null })).toBe(0);
    expect(
      gearPowerTotal({
        weapon: { power: 10, rarity: 'common', realm: 0, zone: 0 },
        armor: null,
        trinket: { power: 5, rarity: 'rare', realm: 0, zone: 1 },
      }),
    ).toBeCloseTo(15, 10);
  });

  it('heroDps applies the Ascendancy damage and gearPower nodes', () => {
    const s = initialState(1);
    expect(heroDps(s)).toBeCloseTo(d0, 10);

    s.hero.level = 3;
    s.hero.skills.cleave = 2;
    s.gear.weapon = { power: 40, rarity: 'common', realm: 0, zone: 0 };
    s.ascendancy.nodes.edge = 2;
    s.ascendancy.nodes.heft = 1;
    const edge = 1 + ASC_NODES.edge!.perRank * 2;
    const heft = 1 + ASC_NODES.heft!.perRank * 1;
    const expected = (d0 * 1.12 ** 3 * edge + 40 * heft) * skillRankMult(2);
    expect(heroDps(s)).toBeCloseTo(expected, 8);
  });

  it('ascBonus sums only the nodes with the asked-for effect', () => {
    const asc = { pending: 0, banked: 0, nodes: { edge: 3, heft: 2, fury: 1 }, victories: 0 };
    expect(ascBonus(asc, 'damage')).toBeCloseTo(ASC_NODES.edge!.perRank * 3, 10);
    expect(ascBonus(asc, 'gearPower')).toBeCloseTo(ASC_NODES.heft!.perRank * 2, 10);
    expect(ascSpeedMultiplier(asc)).toBeCloseTo(1 + ASC_NODES.fury!.perRank * 1, 10);
  });
});

describe('the earnings bonus is gold-only', () => {
  it('compounds per victory', () => {
    expect(earningsMultiplier(0)).toBe(1);
    expect(earningsMultiplier(3)).toBeCloseTo((1 + EARNINGS_BONUS_PER_VICTORY) ** 3, 10);
  });

  it('multiplies kill gold', () => {
    const s = initialState(1);
    const base = goldPerKill(s);
    s.ascendancy.victories = 4;
    expect(goldPerKill(s)).toBeCloseTo(base * earningsMultiplier(4), 10);
  });

  it('leaves DPS, kill time, and swing damage untouched', () => {
    const s = initialState(1);
    const dps = heroDps(s);
    const swing = damagePerSwing(s);
    const speed = attackSpeedMultiplier(s, 0.5);
    s.ascendancy.victories = 10;
    expect(heroDps(s)).toBe(dps);
    expect(damagePerSwing(s)).toBe(swing);
    expect(attackSpeedMultiplier(s, 0.5)).toBe(speed);
  });
});

describe('boss combat formulas', () => {
  it('damage per swing is DPS times the nominal swing second', () => {
    const s = initialState(1);
    expect(damagePerSwing(s)).toBeCloseTo(heroDps(s) * bossSwingSec, 10);
  });

  it('effective boss DPS is heroDps times the speed multiplier', () => {
    const s = initialState(1);
    for (const m of [0, 0.5, 1]) {
      const effective = damagePerSwing(s) / swingInterval(s, m);
      expect(effective).toBeCloseTo(heroDps(s) * attackSpeedMultiplier(s, m), 8);
    }
  });

  it('bossEtaSec falls as momentum rises and is Infinity at zero DPS', () => {
    const s = initialState(1);
    s.boss = { hpRemaining: bossHp(0), hpMax: bossHp(0), enteredAtSec: 0 };
    expect(bossEtaSec(s, 1)).toBeLessThan(bossEtaSec(s, 0));

    // A hero who deals literally nothing never finishes, rather than returning
    // NaN into client state.
    s.gear = { weapon: null, armor: null, trinket: null };
    s.hero.level = -1e9; // rD^-1e9 underflows to 0
    expect(heroDps(s)).toBe(0);
    expect(bossEtaSec(s, 0)).toBe(Infinity);
  });
});

describe('Ascendancy accrual formulas', () => {
  it('both accruals grow linearly per realm', () => {
    expect(ascendancyPerZone(0)).toBeCloseTo(ASC_PER_ZONE, 10);
    expect(ascendancyPerZone(2)).toBeCloseTo(ASC_PER_ZONE * (1 + ASC_REALM_GROWTH * 2), 10);
    expect(ascendancyBossPayout(0)).toBeCloseTo(ASC_BOSS_PAYOUT, 10);
    expect(ascendancyBossPayout(2)).toBeCloseTo(
      ASC_BOSS_PAYOUT * (1 + ASC_REALM_GROWTH * 2),
      10,
    );
  });

  it('the guardian payout is worth several zones, at every realm', () => {
    for (const realm of [0, 1, 4]) {
      const zones = ascendancyBossPayout(realm) / ascendancyPerZone(realm);
      expect(zones).toBeGreaterThanOrEqual(5);
      expect(zones).toBeLessThan(zonesPerRealm);
    }
  });
});
