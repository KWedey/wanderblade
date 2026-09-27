// Pure formula helpers. No mutation, no RNG — just the ECONOMY.md math.

import {
  ASC_BOSS_PAYOUT,
  ASC_CATCHES_PER_ZONE,
  ASC_COST_STEP,
  ASC_NODES,
  ASC_NODE_IDS,
  ASC_PER_ZONE,
  ASC_REALM_GROWTH,
  ASC_SPEED_DECAY,
  ASC_SPEED_MAX_BONUS,
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
  SKILL_IDS,
  SKILLS,
  SLOT_POWER,
  SPECIES,
  zonesPerRealm,
} from './constants';
import type { SpeciesDef } from './constants';
import { momentumMultiplier } from './momentum';
import type { AscendancyState, GameState, GearSlot, GearState, Rarity } from './types';

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
  return enemyGold(state.realm, state.zone) * earningsMultiplier(state.ascendancy.victories);
}

const SPECIES_FRACTION = 0.732_050_807_568_877_2;

/**
 * Which species the kill at `killIndex` is. Derived rather than rolled — a
 * third irrational, so it consumes no RNG draw and cannot shift the kill-keyed
 * stream that every drop depends on (docs/DECISIONS.md #6).
 */
export function speciesIndex(killIndex: number): number {
  const u = (killIndex * SPECIES_FRACTION) % 1;
  const i = Math.floor(u * SPECIES.length);
  return i >= SPECIES.length ? SPECIES.length - 1 : i;
}

/** The species definition for `killIndex`. */
export function speciesFor(killIndex: number): SpeciesDef {
  return SPECIES[speciesIndex(killIndex)] as SpeciesDef;
}

/** Guardian HP for `realm`: a multiple of that realm's final-zone enemy. */
export function bossHp(realm: number): number {
  return (
    bossHpMult * enemyHp(realm, zonesPerRealm - 1) * Math.pow(BOSS_REALM_GAIN, realm)
  );
}

/** Power of a drop rolled at zone `z` of `realm` at `rarity`. */
export function gearPower(
  realm: number,
  z: number,
  rarity: Rarity,
  slot: GearSlot,
): number {
  return (
    gearPowerBase *
    realmScale(realm) *
    Math.pow(gearPowerRate, z) *
    RARITY_MULTIPLIERS[rarity] *
    (SLOT_POWER[slot] ?? 1)
  );
}

/** Cost of the next hero level. Realm-local, so it scales with the realm. */
export function levelCost(level: number, realm: number): number {
  return levelCostBase * Math.pow(rC, level) * realmScale(realm);
}

/** Cost of the next rank of a realm-local skill. */
export function skillCost(id: string, rank: number, realm: number): number {
  const def = SKILLS[id];
  if (!def) return Infinity;
  return def.costBase * Math.pow(def.costRate, rank) * realmScale(realm);
}

/** Banked-Ascendancy cost of the next rank of `id`. Uncapped; Infinity if unknown. */
export function ascNodeCost(id: string, rank: number): number {
  const def = ASC_NODES[id];
  if (!def) return Infinity;
  return def.costBase * (1 + ASC_COST_STEP * rank);
}

/**
 * Banked Ascendancy already sunk into the tree: the exact sum of every rank
 * price paid. With an uncapped tree the leftover balance is spending residue,
 * so "how much did this run earn" is balance plus this.
 */
export function ascSpent(asc: AscendancyState): number {
  let total = 0;
  for (const id of ASC_NODE_IDS) {
    const rank = asc.nodes[id] ?? 0;
    for (let r = 0; r < rank; r++) total += ascNodeCost(id, r);
  }
  return total;
}

/**
 * The tree's multiplier for one effect. Damage and gear power compound per
 * rank and are unbounded; attack speed rises toward `1 + ASC_SPEED_MAX_BONUS`
 * and stops, because it is the one that costs the engine work.
 */
export function ascMultiplier(asc: AscendancyState, effect: AscNodeEffect): number {
  let ranks = 0;
  let m = 1;
  for (const id of ASC_NODE_IDS) {
    const def = ASC_NODES[id];
    if (!def || def.effect !== effect) continue;
    const rank = asc.nodes[id] ?? 0;
    ranks += rank;
    if (def.effect !== 'attackSpeed') m *= Math.pow(1 + def.perRank, rank);
  }
  if (effect !== 'attackSpeed') return m;
  return ranks > 0 ? 1 + ASC_SPEED_MAX_BONUS * (1 - Math.pow(ASC_SPEED_DECAY, ranks)) : 1;
}

/** Hero base damage from realm-local levels. */
export function heroBaseDamage(level: number, realm: number): number {
  return d0 * Math.pow(rD, level) * realmScale(realm);
}

/** One skill's DPS factor at `rank`: rises toward its own 1 + maxBonus, never past. */
export function skillRankMult(id: string, rank: number): number {
  if (!(rank > 0)) return 1;
  const def = SKILLS[id];
  if (!def) return 1;
  return 1 + def.maxBonus * (1 - Math.pow(def.decay, rank));
}

/**
 * skillMult = Π over realm-local skills of `skillRankMult(id, rank)`, walked in
 * SKILL_IDS order so the float product cannot depend on a save's key order.
 */
export function skillMult(skills: Record<string, number>): number {
  let m = 1;
  for (const id of SKILL_IDS) {
    m *= skillRankMult(id, skills[id] ?? 0);
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
  const dmgBonus = ascMultiplier(state.ascendancy, 'damage');
  const gearBonus = ascMultiplier(state.ascendancy, 'gearPower');
  return (base * dmgBonus + gear * gearBonus) * skillMult(state.hero.skills);
}

/** Persistent attack-speed multiplier from the Ascendancy tree. */
export function ascSpeedMultiplier(asc: AscendancyState): number {
  return ascMultiplier(asc, 'attackSpeed');
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

/**
 * Estimated seconds to fell the guardian at `momentum` — the fight in progress
 * while in the boss phase, and the fight the portal would start when on the
 * Road. Reading `boss.hpRemaining` on a Road state answers a question nobody
 * asked: it is 0 until entry, so the preview a player commits on read `0s`.
 *
 * An unknown answer is `Infinity`, never 0. Zero is the one wrong value that
 * looks like an invitation.
 */
export function bossEtaSec(state: GameState, momentum: number): number {
  const hp = state.phase === 'boss' ? state.boss.hpRemaining : bossHp(state.realm);
  const dps = damagePerSwing(state) / swingInterval(state, momentum);
  if (!(dps > 0) || !Number.isFinite(hp) || !Number.isFinite(dps)) return Infinity;
  const eta = hp / dps;
  return Number.isFinite(eta) ? eta : Infinity;
}

/** Pending Ascendancy granted for clearing one zone of `realm`. */
export function ascendancyPerZone(realm: number): number {
  return ASC_PER_ZONE * (1 + ASC_REALM_GROWTH * realm);
}

/** Pending Ascendancy granted by catching one loot-arc coin in `realm`. */
export function ascendancyPerCatch(realm: number): number {
  return ascendancyPerZone(realm) / ASC_CATCHES_PER_ZONE;
}

/** Pending Ascendancy granted by felling `realm`'s guardian. */
export function ascendancyBossPayout(realm: number): number {
  return ASC_BOSS_PAYOUT * (1 + ASC_REALM_GROWTH * realm);
}
