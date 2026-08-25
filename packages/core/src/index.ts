// @wanderblade/core — pure, deterministic game rules for Wanderblade.
// The game client and the sim both consume this; offline progress and live play
// run this same code path (docs/DECISIONS.md #5, #6).

// --- RNG -----------------------------------------------------------------
export { createRng } from './rng';
export type { Rng } from './rng';

// --- Constants -----------------------------------------------------------
export {
  REALM_STEP,
  hp0,
  rH,
  g0,
  rG,
  d0,
  rD,
  levelCostBase,
  rC,
  skillCostBase,
  skillCostRate,
  skillMultPerLevel,
  gearPowerBase,
  gearPowerRate,
  dropChance,
  RARITY_WEIGHTS,
  RARITY_MULTIPLIERS,
  RARITIES,
  GEAR_SLOTS,
  killsPerZone,
  zonesPerRealm,
  leaguePerKill,
  minKillTimeSec,
  bossSwingSec,
  MOMENTUM_PER_STRIKE,
  MOMENTUM_HALF_LIFE_SEC,
  MOMENTUM_MAX_BONUS,
  ARC_FLIGHT_SEC,
  ARC_CATCH_MULT,
  bossHpMult,
  ASC_PER_ZONE,
  ASC_BOSS_PAYOUT,
  ASC_REALM_GROWTH,
  EARNINGS_BONUS_PER_VICTORY,
  ASC_NODES,
  ASC_NODE_IDS,
  SKILLS,
  SKILL_IDS,
} from './constants';
export type { AscNodeDef, SkillDef } from './constants';

// --- Types ---------------------------------------------------------------
export type {
  Rarity,
  GearSlot,
  GearItem,
  GearState,
  HeroState,
  Phase,
  MomentumState,
  LootArc,
  BossState,
  AscendancyState,
  CollectionState,
  LifetimeStats,
  GameState,
  Recap,
  GameEvent,
  EventLog,
} from './types';

// --- Momentum ------------------------------------------------------------
export {
  momentumAt,
  addMomentum,
  momentumMultiplier,
  sustainStrikeRate,
} from './momentum';

// --- Formulas ------------------------------------------------------------
export {
  realmScale,
  enemyHp,
  enemyGold,
  earningsMultiplier,
  goldPerKill,
  bossHp,
  gearPower,
  levelCost,
  skillCost,
  ascNodeCost,
  ascBonus,
  heroBaseDamage,
  skillMult,
  gearPowerTotal,
  heroDps,
  ascSpeedMultiplier,
  attackSpeedMultiplier,
  killTime,
  swingInterval,
  damagePerSwing,
  bossEtaSec,
  ascendancyPerZone,
  ascendancyBossPayout,
} from './formulas';
export type { AscNodeEffect } from './formulas';

// --- Engine --------------------------------------------------------------
export {
  EVENT_CAP,
  initialState,
  buyHeroLevel,
  buySkill,
  buyAscendancyNode,
  enterPortal,
  abandonBoss,
  advance,
  serialize,
  deserialize,
  summarizeEvents,
} from './engine';
