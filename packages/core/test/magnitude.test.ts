import { describe, expect, it } from 'vitest';
import {
  advance,
  ascendancyBossPayout,
  ascendancyPerZone,
  ascMultiplier,
  ascNodeCost,
  ascSpeedMultiplier,
  attackSpeedMultiplier,
  bossEtaSec,
  bossHp,
  damagePerSwing,
  earningsMultiplier,
  enemyGold,
  enemyHp,
  enterPortal,
  gearPower,
  gearPowerTotal,
  goldPerKill,
  heroBaseDamage,
  heroDps,
  initialState,
  killTime,
  levelCost,
  realmScale,
  skillCost,
  skillMult,
  swingInterval,
  zonesPerRealm,
  type GameState,
} from '../src/index';

/**
 * Hero level at `realm` on the curve the simulator actually walks: about 180
 * by realm 10, then roughly 1.3 more per realm. Level and realm both feed
 * `heroBaseDamage` and `levelCost`, so an invented level moves the overflow
 * frontier on its own.
 */
function levelAt(realm: number): number {
  return Math.round(180 + 1.3 * realm);
}

/** A late-realm state: deep gear, a deep tree, a long ladder of hero levels. */
function deepState(realm: number, level = levelAt(realm)): GameState {
  const s = initialState(1);
  s.realm = realm;
  s.zone = zonesPerRealm - 1;
  s.killsInZone = 0;
  s.portalReady = true;
  s.hero.level = level;
  const power = gearPower(realm, zonesPerRealm - 1, 'epic');
  s.gear.weapon = { power, rarity: 'epic', realm, zone: s.zone };
  s.gear.armor = { power, rarity: 'epic', realm, zone: s.zone };
  s.gear.trinket = { power, rarity: 'epic', realm, zone: s.zone };
  s.ascendancy.victories = realm;
  // Roughly what ~1 rank per node per realm reaches by here.
  s.ascendancy.nodes = { edge: realm, heft: realm, fury: realm };
  s.ascendancy.banked = 1e6;
  s.gold = 1e12;
  s.boss.hpMax = bossHp(realm);
  s.boss.hpRemaining = bossHp(realm);
  s.nextActionAtSec = s.timeSec + killTime(s, 0);
  return s;
}

/** Every scalar a client reads off a state, as one labelled list. */
function clientFacing(s: GameState): Array<[string, number]> {
  return [
    ['realmScale', realmScale(s.realm)],
    ['enemyHp', enemyHp(s.realm, s.zone)],
    ['enemyGold', enemyGold(s.realm, s.zone)],
    ['bossHp', bossHp(s.realm)],
    ['gearPowerTotal', gearPowerTotal(s.gear)],
    ['heroBaseDamage', heroBaseDamage(s.hero.level, s.realm)],
    ['skillMult', skillMult(s.hero.skills)],
    ['heroDps', heroDps(s)],
    ['damagePerSwing', damagePerSwing(s)],
    ['killTime', killTime(s, 1)],
    ['swingInterval', swingInterval(s, 1)],
    ['bossEtaSec', bossEtaSec(s, 1)],
    ['goldPerKill', goldPerKill(s)],
    ['gold', s.gold],
    ['earningsMultiplier', earningsMultiplier(s.ascendancy.victories)],
    ['attackSpeedMultiplier', attackSpeedMultiplier(s, 1)],
    ['ascSpeedMultiplier', ascSpeedMultiplier(s.ascendancy)],
    ['ascDamageMult', ascMultiplier(s.ascendancy, 'damage')],
    ['ascGearMult', ascMultiplier(s.ascendancy, 'gearPower')],
    ['levelCost', levelCost(s.hero.level, s.realm)],
    ['skillCost', skillCost(200, s.realm)],
    ['ascNodeCost', ascNodeCost('edge', 300)],
    ['ascendancyPerZone', ascendancyPerZone(s.realm)],
    ['ascendancyBossPayout', ascendancyBossPayout(s.realm)],
    ['bossHpRemaining', s.boss.hpRemaining],
  ];
}

describe('the engine stays finite at the magnitudes late realms actually reach', () => {
  it('keeps every client-facing scalar finite at realm 199', () => {
    const s = deepState(199);
    for (const [name, value] of clientFacing(s)) {
      expect(Number.isFinite(value), `${name} = ${value}`).toBe(true);
      expect(Number.isNaN(value), `${name} is NaN`).toBe(false);
    }
  });

  it('keeps a realm-199 guardian attempt finite while it is fought', () => {
    const s = deepState(199);
    expect(enterPortal(s).entered).toBe(true);
    advance(s, 600);
    expect(Number.isFinite(s.boss.hpRemaining)).toBe(true);
    expect(Number.isFinite(s.timeSec)).toBe(true);
    expect(Number.isFinite(s.nextActionAtSec)).toBe(true);
    for (const [name, value] of clientFacing(s)) {
      expect(Number.isFinite(value), `${name} = ${value}`).toBe(true);
    }
  });

  it('keeps a realm-199 Road advance finite and exact across a long gap', () => {
    const s = deepState(199);
    s.zone = 0;
    s.nextActionAtSec = s.timeSec + killTime(s, 0);
    advance(s, 3600);
    expect(Number.isFinite(s.gold)).toBe(true);
    expect(Number.isFinite(s.leagues)).toBe(true);
    expect(Number.isFinite(s.lifetime.goldEarned)).toBe(true);
    expect(Number.isInteger(s.lifetime.kills)).toBe(true);
  });

  /**
   * `bossHp` is the largest quantity in the game, so it overflows first. This
   * pins where, because past it the guardian's HP is Infinity and no build can
   * ever fell it — a soft-lock, not a rendering problem. A constant change that
   * drags the frontier toward realms a player can reach must fail here.
   */
  it('pins the realm where the first quantity overflows to Infinity', () => {
    const firstNonFinite = (f: (r: number) => number): number => {
      for (let r = 0; r < 600; r++) if (!Number.isFinite(f(r))) return r;
      return Infinity;
    };
    const frontier = {
      bossHp: firstNonFinite((r) => bossHp(r)),
      enemyHp: firstNonFinite((r) => enemyHp(r, zonesPerRealm - 1)),
      gearPower: firstNonFinite((r) => gearPower(r, zonesPerRealm - 1, 'epic')),
      enemyGold: firstNonFinite((r) => enemyGold(r, zonesPerRealm - 1)),
      levelCost: firstNonFinite((r) => levelCost(0, r)),
      realmScale: firstNonFinite((r) => realmScale(r)),
    };
    expect(frontier).toEqual({
      bossHp: 297,
      enemyHp: 330,
      gearPower: 331,
      enemyGold: 333,
      levelCost: 341,
      realmScale: 342,
    });

    const earliest = Math.min(...Object.values(frontier));
    expect(earliest).toBe(297);
    for (const [name, value] of clientFacing(deepState(earliest - 1))) {
      expect(Number.isFinite(value), `${name} at realm ${earliest - 1}`).toBe(true);
    }
  });

  /**
   * Hero level multiplies the realm scale in both `heroBaseDamage` and
   * `levelCost`, so a tall enough ladder overflows well before realm 297. The
   * frontier is a surface, not a line, and this pins where it crosses.
   */
  it('pins how far the hero level ladder can go before it overflows', () => {
    const topLevel = (realm: number): number => {
      for (let level = 0; level < 20_000; level += 1) {
        if (!Number.isFinite(heroBaseDamage(level, realm))) return level;
        if (!Number.isFinite(levelCost(level, realm))) return level;
      }
      return Infinity;
    };
    expect(topLevel(0)).toBe(5063);
    expect(topLevel(100)).toBe(3575);
    expect(topLevel(199)).toBe(2102);
    expect(topLevel(296)).toBe(659);
    // The curve the simulator walks stays well clear of both.
    expect(levelAt(199)).toBeLessThan(topLevel(199));
    expect(levelAt(296)).toBeLessThan(topLevel(296));
  });
});
