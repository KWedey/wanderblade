// Pure formula helpers. No mutation, no RNG — just the ECONOMY.md math.

import {
  ASC_BOSS_PAYOUT,
  ASC_NODES,
  ASC_NODE_IDS,
  ASC_PER_ZONE,
  ASC_REALM_GROWTH,
  BOSS_REALM_GAIN,
  bossHpMult,
  bossSwingSec,
  d0,
  EARNINGS_BONUS_PER_VICTORY,
  g0,
  gearPowerBase,
  gearPowerRate,
  hp0,
  levelCostBase,
  minKillTimeSec,
  rC,
  rD,
  REALM_STEP,
  rG,
  rH,
  RARITY_MULTIPLIERS,
  skillCostBase,
  skillCostRate,
  SKILL_IDS,
  SKILL_MAX_BONUS,
  SKILL_RANK_DECAY,
  zonesPerRealm,
} from './constants';
import { momentumMultiplier } from './momentum';
import type { AscendancyState, GameState, GearState, Rarity } from './types';

export type AscNodeEffect = 'damage' | 'gearPower' | 'attackSpeed';

/** Every gold and power quantity in realm `r` is this multiple of realm 0's. */
export function realmScale(realm: number): number {
  return Math.pow(REALM_STEP, realm);
}

/** Enemy HP at zone `z` of `realm`. */
export function enemyHp(realm: number, z: number): number {
  return hp0 * realmScale(realm) * Math.pow(rH, z);
}

/** Base enemy gold at zone `z` of `realm`, before the earnings bonus. */
export function enemyGold(realm: number, z: number): number {
  return g0 * realmScale(realm) * Math.pow(rG, z);
}

/** The automatic per-victory bonus to gold and passive earnings. Never DPS. */
export function earningsMultiplier(victories: number): number {
  return Math.pow(1 + EARNINGS_BONUS_PER_VICTORY, victories);
}

/** Gold actually credited by one Road kill in the hero's current position. */
export function goldPerKill(state: GameState): number {
  return (
    enemyGold(state.realm, state.zone) * earningsMultiplier(state.ascendancy.victories)
  );
}

/** Guardian HP for `realm`: a multiple of that realm's final-zone enemy. */
export function bossHp(realm: number): number {
  return (
    bossHpMult * enemyHp(realm, zonesPerRealm - 1) * Math.pow(BOSS_REALM_GAIN, realm)
  );
}

/** Power of a drop rolled at zone `z` of `realm` at `rarity`. */
export function gearPower(realm: number, z: number, rarity: Rarity): number {
  return (
    gearPowerBase *
    realmScale(realm) *
    Math.pow(gearPowerRate, z) *
    RARITY_MULTIPLIERS[rarity]
  );
}

/** Cost of the next hero level. Realm-local, so it scales with the realm. */
export function levelCost(level: number, realm: number): number {
  return levelCostBase * Math.pow(rC, level) * realmScale(realm);
}

/** Cost of the next rank of a realm-local skill. */
export function skillCost(rank: number, realm: number): number {
  return skillCostBase * Math.pow(skillCostRate, rank) * realmScale(realm);
}

/** Banked-Ascendancy cost of the next rank of `id`, or Infinity if capped. */
export function ascNodeCost(id: string, rank: number): number {
  const def = ASC_NODES[id];
  if (!def || rank >= def.maxRank) return Infinity;
  return def.costBase * Math.pow(def.costRate, rank);
}

/** Summed `perRank` across purchased nodes with the given effect. */
export function ascBonus(asc: AscendancyState, effect: AscNodeEffect): number {
  let total = 0;
  for (const id of ASC_NODE_IDS) {
    const def = ASC_NODES[id];
    if (!def || def.effect !== effect) continue;
    total += def.perRank * (asc.nodes[id] ?? 0);
  }
  return total;
}

/** Hero base damage from realm-local levels. */
export function heroBaseDamage(level: number, realm: number): number {
  return d0 * Math.pow(rD, level) * realmScale(realm);
}

/** One skill's DPS factor at `rank`: rises toward 1 + SKILL_MAX_BONUS, never past. */
export function skillRankMult(rank: number): number {
  if (!(rank > 0)) return 1;
  return 1 + SKILL_MAX_BONUS * (1 - Math.pow(SKILL_RANK_DECAY, rank));
}

/**
 * skillMult = Π over realm-local skills of `skillRankMult(rank)`, walked in
 * SKILL_IDS order so the float product cannot depend on a save's key order.
 */
export function skillMult(skills: Record<string, number>): number {
  let m = 1;
  for (const id of SKILL_IDS) {
    m *= skillRankMult(skills[id] ?? 0);
  }
  return m;
}

/** Total equipped gear power across the three slots. */
export function gearPowerTotal(gear: GearState): number {
  return (gear.weapon?.power ?? 0) + (gear.armor?.power ?? 0) + (gear.trinket?.power ?? 0);
}

/**
 * Damage per nominal swing-second, before any speed multiplier. The Ascendancy
 * damage and gearPower nodes enter here; the earnings bonus never does.
 */
export function heroDps(state: GameState): number {
  const base = heroBaseDamage(state.hero.level, state.realm);
  const gear = gearPowerTotal(state.gear);
  const dmgBonus = 1 + ascBonus(state.ascendancy, 'damage');
  const gearBonus = 1 + ascBonus(state.ascendancy, 'gearPower');
  return (base * dmgBonus + gear * gearBonus) * skillMult(state.hero.skills);
}

/** Persistent attack-speed multiplier from the Ascendancy tree. */
export function ascSpeedMultiplier(asc: AscendancyState): number {
  return 1 + ascBonus(asc, 'attackSpeed');
}

/** Combined attack-speed multiplier: persistent tree speed times momentum. */
export function attackSpeedMultiplier(state: GameState, momentum: number): number {
  return ascSpeedMultiplier(state.ascendancy) * momentumMultiplier(momentum);
}

/**
 * Seconds to fell the current zone's enemy at `momentum`. The idle floor is
 * applied before the speed divide, so momentum beats the floor rather than
 * being swallowed by it.
 */
export function killTime(state: GameState, momentum: number): number {
  const raw = enemyHp(state.realm, state.zone) / heroDps(state);
  const floored = !Number.isFinite(raw) || raw < minKillTimeSec ? minKillTimeSec : raw;
  const t = floored / attackSpeedMultiplier(state, momentum);
  return Number.isFinite(t) && t > 0 ? t : minKillTimeSec;
}

/** Seconds between hero swings against the guardian at `momentum`. */
export function swingInterval(state: GameState, momentum: number): number {
  const t = bossSwingSec / attackSpeedMultiplier(state, momentum);
  return Number.isFinite(t) && t > 0 ? t : bossSwingSec;
}

/** Damage one swing deals. Speed lives in the interval, not the hit. */
export function damagePerSwing(state: GameState): number {
  return heroDps(state) * bossSwingSec;
}

/** Estimated seconds to fell the guardian from here at `momentum`. */
export function bossEtaSec(state: GameState, momentum: number): number {
  const dps = damagePerSwing(state) / swingInterval(state, momentum);
  if (!(dps > 0) || !Number.isFinite(state.boss.hpRemaining)) return Infinity;
  const eta = state.boss.hpRemaining / dps;
  return Number.isFinite(eta) ? eta : 0;
}

/** Pending Ascendancy granted for clearing one zone of `realm`. */
export function ascendancyPerZone(realm: number): number {
  return ASC_PER_ZONE * (1 + ASC_REALM_GROWTH * realm);
}

/** Pending Ascendancy granted by felling `realm`'s guardian. */
export function ascendancyBossPayout(realm: number): number {
  return ASC_BOSS_PAYOUT * (1 + ASC_REALM_GROWTH * realm);
}
