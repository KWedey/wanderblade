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
  ARC_SPLIT_MIN,
  ARC_SPLIT_MAX,
  ARC_STAGGER_SEC,
  COIN_SHARE_SPREAD,
  ARC_MIN_REACH,
  ARC_MAX_REACH,
  ARC_CATCH_SEC,
  ARC_CATCH_PERP,
  bossHpMult,
  BOSS_REALM_GAIN,
  ASC_COST_STEP,
  ASC_SPEED_MAX_BONUS,
  ASC_SPEED_DECAY,
  ASC_PER_ZONE,
  ASC_BOSS_PAYOUT,
  ASC_CATCHES_PER_ZONE,
  ASC_REALM_GROWTH,
  EARNINGS_BONUS_PER_VICTORY,
  ASC_NODES,
  ASC_NODE_IDS,
  SKILLS,
  SKILL_IDS,
  SLOT_POWER,
  SPECIES,
  SKILL_MULT_CEILING,
} from './constants';
export type { AscNodeDef, SkillDef, SpeciesDef } from './constants';

// --- Clock ---------------------------------------------------------------
export { CLOCK_MS_PER_SEC, clockAfter, clockMs } from './clock';

// --- Types ---------------------------------------------------------------
export type {
  ArcPoint,
  PortalEntry,
  PortalRefusal,
  Strike,
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

// --- Loot arcs -----------------------------------------------------------
export {
  arcCatchRadius,
  arcHeadingAt,
  arcHitIndex,
  arcLandingX,
  arcPositionAt,
  arcsForKill,
  arcSpeedAt,
  arcSplitCount,
} from './arcs';

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
  speciesFor,
  speciesIndex,
  enemyHp,
  enemyGold,
  earningsMultiplier,
  goldPerKill,
  bossHp,
  gearPower,
  levelCost,
  skillCost,
  ascNodeCost,
  ascMultiplier,
  ascSpent,
  heroBaseDamage,
  skillMult,
  skillRankMult,
  gearPowerTotal,
  heroDps,
  ascSpeedMultiplier,
  attackSpeedMultiplier,
  killTime,
  swingInterval,
  damagePerSwing,
  bossEtaSec,
  ascendancyPerZone,
  ascendancyPerCatch,
  ascendancyBossPayout,
} from './formulas';
export type { AscNodeEffect } from './formulas';

// --- Shop ----------------------------------------------------------------
export { purchaseOptions, bestBuy, affordableCount, pricedCount } from './shop';
export type { PurchaseOption, PurchaseKind, PurchaseCurrency } from './shop';

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
  pickRarity,
  serialize,
  deserialize,
  summarizeEvents,
} from './engine';
