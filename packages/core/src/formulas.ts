// Pure formula helpers. No mutation, no RNG — just the ECONOMY.md math.

import {
  hp0,
  rH,
  g0,
  rG,
  bossHpMult,
  d0,
  rD,
  levelCostBase,
  rC,
  skillCostBase,
  skillCostRate,
  skillMultPerLevel,
  enrageWindowSec,
  zonesPerRegion,
} from './constants';
import type { GameState, GearState } from './types';

/** Enemy HP at global zone `z`: hp(z) = hp0 * rH^z. */
export function enemyHp(z: number): number {
  return hp0 * Math.pow(rH, z);
}

/** Enemy gold drop at zone `z`: gold(z) = g0 * rG^z. */
export function enemyGold(z: number): number {
  return g0 * Math.pow(rG, z);
}

/** Region boss HP for a boss sitting at zone `z`: bossHpMult * hp(z). */
export function bossHp(z: number): number {
  return bossHpMult * enemyHp(z);
}

/** Cost to buy the next hero level from `level`: 10 * 1.15^level. */
export function levelCost(level: number): number {
  return levelCostBase * Math.pow(rC, level);
}

/** Cost to buy the next rank of a skill currently at `skillLevel`: 50 * 1.15^skillLevel. */
export function skillCost(skillLevel: number): number {
  return skillCostBase * Math.pow(skillCostRate, skillLevel);
}

/** Hero base damage from levels: base(level) = d0 * rD^level (= 5 * 1.12^level). */
export function heroBaseDamage(level: number): number {
  return d0 * Math.pow(rD, level);
}

/** skillMult = Π over skills of (1 + 0.05 * skillLevel). Level-0 skills contribute 1. */
export function skillMult(skills: Record<string, number>): number {
  let m = 1;
  for (const level of Object.values(skills)) {
    m *= 1 + skillMultPerLevel * level;
  }
  return m;
}

/** Total equipped gear power across the three slots. */
export function gearPowerTotal(gear: GearState): number {
  return (
    (gear.weapon?.power ?? 0) + (gear.armor?.power ?? 0) + (gear.trinket?.power ?? 0)
  );
}

/**
 * Hero DPS: (base(level) + gearPower) * skillMult * (1 + mastery).
 * Mastery (Bestiary) is 0 in the M0 baseline — see ECONOMY.md "Bestiary caveat".
 */
export function heroDps(state: GameState): number {
  const base = heroBaseDamage(state.hero.level);
  const gear = gearPowerTotal(state.gear);
  const mult = skillMult(state.hero.skills);
  const mastery = 0;
  return (base + gear) * mult * (1 + mastery);
}

/** The zone the current region's boss sits at (that region's last zone). */
export function bossZoneOf(zone: number): number {
  return Math.floor(zone / zonesPerRegion) * zonesPerRegion + (zonesPerRegion - 1);
}

/**
 * Readiness against the current region's boss: (dps * enrageWindow) / bossHp.
 * >= 1.0 wins a manual challenge; >= autoChallengeReadiness triggers auto-challenge.
 */
export function readiness(state: GameState): number {
  const bz = bossZoneOf(state.zone);
  return (heroDps(state) * enrageWindowSec) / bossHp(bz);
}
