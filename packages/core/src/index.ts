// @wanderblade/core — pure, deterministic game rules for Wanderblade.
// The game client and the sim both consume this; offline progress and live play
// run this same code path (docs/DECISIONS.md #5, #6).

// --- RNG -----------------------------------------------------------------
export { createRng } from './rng';
export type { Rng } from './rng';

// --- Constants -----------------------------------------------------------
export {
  CONSTANTS,
  hp0,
  rH,
  g0,
  rG,
  bossHpMult,
  d0,
  rD,
  levelCostBase,
  c0,
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
  zonesPerRegion,
  regionsCount,
  leaguePerKill,
  enrageWindowSec,
  autoChallengeReadiness,
  bossRetryCooldownSec,
  minKillTimeSec,
  SKILLS,
  SKILL_IDS,
} from './constants';
export type { SkillDef } from './constants';

// --- Types ---------------------------------------------------------------
export type {
  Rarity,
  GearSlot,
  GearItem,
  GearState,
  HeroState,
  GateState,
  LifetimeStats,
  GameState,
  Recap,
  GameEvent,
  EventLog,
} from './types';

// --- Formulas ------------------------------------------------------------
export {
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
} from './formulas';

// --- Engine --------------------------------------------------------------
export {
  EVENT_CAP,
  initialState,
  killTime,
  buyHeroLevel,
  buySkill,
  advance,
  challengeBoss,
  serialize,
  deserialize,
  summarizeEvents,
} from './engine';
