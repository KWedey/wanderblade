import { describe, expect, it } from 'vitest';
import {
  advance,
  ARC_CATCH_MULT,
  ARC_SPLIT_MAX,
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
  killsPerZoneFor,
  killTime,
  levelCost,
  realmScale,
  skillCost,
  SKILL_IDS,
  skillMult,
  swingInterval,
  zonesForRealm,
  type GameState,
} from '../src/index';

/**
 * Hero level at `realm` on the curve the simulator actually walks. Level resets
 * on ascension, so a realm's ladder is the levels its HP span demands
 * (50 zones at ln rH / ln rD, about 97) plus what the earnings bonus funds on
 * top (about half a level per realm). Level and realm both feed
 * `heroBaseDamage` and `levelCost`, so an invented level moves the overflow
 * frontier on its own.
 */
function levelAt(realm: number): number {
  return Math.round(100 + 0.5 * realm);
}

/**
 * The most ranks of one skill a realm could buy if every coin it drops were
 * caught and spent on that track alone. Cost and gold both carry the realm
 * scale, so the bound is the same in every realm past the ramp.
 */
function rankReach(id: string, realm: number): number {
  let budget = 0;
  for (let z = 0; z < zonesForRealm(realm); z++) {
    budget += killsPerZoneFor(realm) * enemyGold(realm, z) * (1 + ARC_SPLIT_MAX * ARC_CATCH_MULT);
  }
  let rank = 0;
  let spent = 0;
  while (spent + skillCost(id, rank, realm) <= budget) {
    spent += skillCost(id, rank, realm);
    rank += 1;
  }
  return rank;
}

/** A late-realm state: deep gear, a deep tree, a long ladder of hero levels. */
function deepState(realm: number, level = levelAt(realm)): GameState {
  const s = initialState(1);
  s.realm = realm;
  s.zone = zonesForRealm(realm) - 1;
  s.killsInZone = 0;
  s.portalReady = true;
  s.hero.level = level;
  const power = gearPower(realm, s.zone, 'epic', 'weapon');
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
    ['skillCost', skillCost('sunder', 2 * rankReach('sunder', s.realm), s.realm)],
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
    expect(Number.isInteger(s.killIndex)).toBe(true);
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
      enemyHp: firstNonFinite((r) => enemyHp(r, zonesForRealm(r) - 1)),
      gearPower: firstNonFinite((r) => gearPower(r, zonesForRealm(r) - 1, 'epic', 'weapon')),
      enemyGold: firstNonFinite((r) => enemyGold(r, zonesForRealm(r) - 1)),
      levelCost: firstNonFinite((r) => levelCost(0, r)),
      realmScale: firstNonFinite((r) => realmScale(r)),
    };
    expect(frontier).toEqual({
      bossHp: 301,
      enemyHp: 330,
      gearPower: 331,
      enemyGold: 329,
      levelCost: 340,
      realmScale: 342,
    });

    const earliest = Math.min(...Object.values(frontier));
    expect(earliest).toBe(301);
    for (const [name, value] of clientFacing(deepState(earliest - 1))) {
      expect(Number.isFinite(value), `${name} at realm ${earliest - 1}`).toBe(true);
    }
  });

  /**
   * Hero level multiplies the realm scale in both `heroBaseDamage` and
   * `levelCost`, so a tall enough ladder overflows well before realm 301. The
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
    expect(topLevel(0)).toBe(2473);
    expect(topLevel(100)).toBe(1744);
    expect(topLevel(199)).toBe(1022);
    expect(topLevel(296)).toBe(315);
    // The curve the simulator walks stays well clear of both.
    expect(levelAt(199)).toBeLessThan(topLevel(199));
    expect(levelAt(296)).toBeLessThan(topLevel(296));
  });

  /**
   * The frontier is a wall, and the engine has to say so rather than open a
   * fight with Infinity HP that no build can ever end. Realm 300 is the last
   * winnable realm; 301 and beyond refuse entry.
   */
  it('closes the portal past the frontier instead of opening an endless fight', () => {
    const ready = (realm: number): GameState => {
      const s = initialState(5);
      s.realm = realm;
      s.zone = zonesForRealm(realm) - 1;
      s.portalReady = true;
      return s;
    };

    const last = ready(300);
    expect(Number.isFinite(bossHp(300))).toBe(true);
    const opened = enterPortal(last);
    expect(opened.entered).toBe(true);
    expect(opened.reason).toBeNull();
    expect(last.phase).toBe('boss');
    expect(Number.isFinite(last.boss.hpMax)).toBe(true);

    for (const realm of [301, 302, 400, 5000]) {
      const s = ready(realm);
      expect(Number.isFinite(bossHp(realm))).toBe(false);
      const res = enterPortal(s);
      expect(res.entered).toBe(false);
      expect(res.reason).toBe('unwinnable');
      expect(res.events).toHaveLength(0);
      // A refused portal leaves the Road exactly as it was.
      expect(s.phase).toBe('road');
      expect(s.boss.hpMax).toBe(0);
      expect(s.boss.hpRemaining).toBe(0);
      expect(s.portalReady).toBe(true);
      // And the preview never invites the commit.
      expect(bossEtaSec(s, 1)).toBe(Infinity);
    }
  });

  it('distinguishes a closed portal from an unopened one', () => {
    const notReady = initialState(5);
    expect(notReady.portalReady).toBe(false);
    expect(enterPortal(notReady).reason).toBe('not-ready');
  });

  /**
   * A skill's price is geometric in its own rate, so the steepest track
   * overflows first, and the realm scale eats the headroom as realms deepen.
   * Pinned because an Infinity price is a MAX label wearing a different hat,
   * and ADR #26 promises the panel never shows one.
   */
  it('keeps every skill priced far past the ranks a realm reaches', () => {
    const frontierAt = (realm: number): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const id of SKILL_IDS) {
        let rank = 0;
        while (rank < 20_000 && Number.isFinite(skillCost(id, rank, realm))) rank += 1;
        out[id] = rank;
      }
      return out;
    };
    expect(frontierAt(0)).toEqual({
      cleave: 510,
      warcry: 284,
      riposte: 197,
      sunder: 151,
      secondWind: 122,
    });
    // Realm-local ranks reset every ascension; the last winnable realm keeps
    // twice the ranks its whole gold could ever buy on any one track.
    const deep = frontierAt(300);
    for (const id of SKILL_IDS) {
      const reach = rankReach(id, 300);
      expect(reach, `${id} reach`).toBeGreaterThan(1);
      expect(deep[id], `${id} frontier ${deep[id]} vs reach ${reach}`).toBeGreaterThan(2 * reach);
    }
  });
});
