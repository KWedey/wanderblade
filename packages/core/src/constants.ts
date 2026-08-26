// Every tunable in one place. Values are tuned in `sim/` against the pacing
// bands in docs/ACTIVE-PLAY.md and the validators in docs/ECONOMY.md.
//
// Naming: terse math symbols (hp0, rH, ...) mirror ECONOMY.md's formulas.

import type { Rarity } from './types';

// --- Realm scaling -------------------------------------------------------
/**
 * Scales every gold- and power-denominated quantity by `REALM_STEP^realm`,
 * making a realm ratio-identical to realm 0. Ascendancy and the earnings bonus
 * are then the only cross-realm asymmetries (docs/DECISIONS.md #21).
 */
export const REALM_STEP = 8;

// --- Enemies -------------------------------------------------------------
/** Enemy HP: hp(realm, z) = hp0 * REALM_STEP^realm * rH^z */
export const hp0 = 10;
export const rH = 1.55;

/** Enemy gold: gold(realm, z) = g0 * REALM_STEP^realm * rG^z. */
export const g0 = 1;
export const rG = 1.48;

// --- Hero ----------------------------------------------------------------
/** Hero base damage: base(level) = d0 * rD^level, scaled by the realm. */
export const d0 = 25;
export const rD = 1.12;

/** Hero level cost: levelCost(level) = levelCostBase * rC^level, realm-scaled. */
export const levelCostBase = 10;
export const rC = 1.15;

/** Skill rank cost: skillCost(rank) = skillCostBase * skillCostRate^rank. */
export const skillCostBase = 50;
export const skillCostRate = 1.15;

/**
 * A skill's DPS factor approaches `1 + SKILL_MAX_BONUS` as its rank rises,
 * closing the remaining gap by `1 - SKILL_RANK_DECAY` each rank. Ranks are
 * uncapped: the asymptote is what keeps `skillMult` bounded, so the panel never
 * has to show MAX and the player always has a priced row to buy.
 */
export const SKILL_MAX_BONUS = 0.176;
export const SKILL_RANK_DECAY = 0.85;

// --- Gear (the primary realm-local power scaler) -------------------------
/** Drop power: gearPowerBase * REALM_STEP^realm * gearPowerRate^z * rarityMult. */
export const gearPowerBase = 2;
/** Gear power grows on the same base as enemy HP, so it tracks difficulty. */
export const gearPowerRate = rH;

/**
 * Chance of a gear drop per kill. Kept scarce: gear power grows on enemy HP's
 * base, so frequent drops make the equipped set track the frontier exactly and
 * every boss becomes the same fight. Scarcity is what makes a build vary.
 */
export const dropChance = 0.008;

/** Rarity roll weights (sum = 100). */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 70,
  uncommon: 23,
  rare: 6,
  epic: 1,
};

/** Power multipliers applied to a drop by rarity. */
export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.5,
  rare: 2.5,
  epic: 4,
};

/** Rarity order, low to high — the cumulative-weight roll and the arc-catch
 * tier upgrade both walk it. */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic'];

export const GEAR_SLOTS = ['weapon', 'armor', 'trinket'] as const;

// --- Realm structure -----------------------------------------------------
export const killsPerZone = 1200;
/** Zones in a realm's road. Clearing the last one makes the portal available. */
export const zonesPerRealm = 50;
/** Leagues gained per Road kill. Zone length = 1 league. */
export const leaguePerKill = 1 / killsPerZone;

// --- Combat pacing -------------------------------------------------------
/**
 * Idle walking floor for a Road kill, in seconds. Momentum divides *through*
 * this floor (see `killTime`), so active play is never capped by it.
 */
export const minKillTimeSec = 0.35;

/** Nominal seconds per hero swing against a guardian at zero momentum. */
export const bossSwingSec = 1;

// --- Momentum (the one active input, shared by both phases) --------------
/** Momentum added by one Strike, clamped into [0, 1]. */
export const MOMENTUM_PER_STRIKE = 0.1;
/** Seconds for momentum to halve with no input (~zero ≈ 6 s after the last). */
export const MOMENTUM_HALF_LIFE_SEC = 2;
/**
 * Attack-speed bonus at full momentum: multiplier = 1 + this * momentum.
 * Tuned so a capped boss fight lands mid-band (1.4x-1.8x faster).
 */
export const MOMENTUM_MAX_BONUS = 0.75;

// --- Loot arcs (the Road's active gold layer) ----------------------------
/** Seconds a kill's loot arc stays catchable. */
export const ARC_FLIGHT_SEC = 1.5;
/**
 * A caught coin pays this multiple of *its own* value — a share of the kill,
 * not the whole kill. The kill already credited 1.0x in full, so a catch pays
 * only the increment and idle loses nothing.
 *
 * It is 1.6 rather than the 1.15 a one-arc-per-kill payout wanted because the
 * binding constraint is the strike rate, not the number of coins in the air:
 * the reference player strikes 3.3x/s against 4.2 kills/s, so splitting a
 * payout across n coins divides each catch by n without buying any more
 * catches. Measured at 1.91-1.95x Road-active, mid-band.
 */
export const ARC_CATCH_MULT = 1.6;
/**
 * Coins per kill. A kill's payout is thrown as several arcs rather than one,
 * so the air carries a stream of loot instead of a single blip, and a catch is
 * partial — `ARC_CATCH_MULT` applies to each coin, not to the whole kill.
 * The count is derived from the kill index, so it is deterministic and the
 * renderer never chooses it.
 */
export const ARC_SPLIT_MIN = 2;
export const ARC_SPLIT_MAX = 4;
/** Seconds between one kill's coins leaving the hero. */
export const ARC_STAGGER_SEC = 0.12;

/** Arc space reach: the nearest and furthest an arc lands from the hero. */
export const ARC_MIN_REACH = 0.5;
export const ARC_MAX_REACH = 1.5;
/**
 * How near a strike must land to catch. Wide enough that aiming at a coin
 * works, tight enough that a strike at empty sky misses.
 */
export const ARC_CATCH_RADIUS = 0.12;

// --- Portal guardian -----------------------------------------------------
/** Guardian HP = this * enemyHp(realm, last zone) * BOSS_REALM_GAIN^realm. */
export const bossHpMult = 30000;
/**
 * Guardians scale slightly faster than their realm. Without it the earnings
 * bonus, which funds hero levels, would shrink every later fight to seconds;
 * with it the Ascendancy tree's bounded power stays the real advantage.
 */
export const BOSS_REALM_GAIN = 1.22;

// --- Ascendancy ----------------------------------------------------------
/**
 * Pending Ascendancy is granted per zone cleared, never per second, so farming
 * an already portal-ready realm earns none of it (docs/DECISIONS.md #22).
 */
export const ASC_PER_ZONE = 1;
/** Guardian victory payout, the dominant share of a realm's Ascendancy. */
export const ASC_BOSS_PAYOUT = 8;
/** Both accruals grow linearly per realm: amount * (1 + this * realm). */
export const ASC_REALM_GROWTH = 0.5;

/** Automatic per-victory bonus to gold and passive earnings. Never touches DPS. */
export const EARNINGS_BONUS_PER_VICTORY = 0.15;

/**
 * How steeply a node's price rises per rank: cost(r) = costBase * (1 + this * r).
 *
 * Linear, not geometric, and that choice is the whole late-game curve. Pending
 * Ascendancy per realm grows linearly (`ASC_REALM_GROWTH`), so lifetime banked
 * grows with realm squared; a linear price makes the rank a player can reach
 * grow *linearly* with the realm, and a multiplicative per-rank effect then
 * makes tree power grow exponentially — the same shape as `bossHp`. A
 * geometric price can only ever buy logarithmic rank growth, which saturates.
 */
export const ASC_COST_STEP = 0.5;

/**
 * Persistent attack speed is the one tree effect that must stay bounded. The
 * engine steps once per kill and once per guardian swing, and speed divides
 * *through* the idle floor (see `killTime`), so unbounded speed means unbounded
 * event steps per simulated second — a long offline gap would never finish
 * reconciling. Damage and gear power carry the unbounded growth instead, where
 * the kill-time floor absorbs them.
 */
export const ASC_SPEED_MAX_BONUS = 0.6;
export const ASC_SPEED_DECAY = 0.9;

export interface AscNodeDef {
  id: string;
  name: string;
  /** Rank r costs costBase * (1 + ASC_COST_STEP * r) banked Ascendancy. */
  costBase: number;
  effect: 'damage' | 'gearPower' | 'attackSpeed';
  /**
   * Each rank multiplies its effect by (1 + this). Compounding, not additive —
   * except on `attackSpeed`, whose curve is ASC_SPEED_MAX_BONUS/DECAY instead.
   */
  perRank: number;
}

/**
 * The persistent combat tree — the only source of persistent combat power, and
 * uncapped, so banked Ascendancy always has somewhere to go.
 */
export const ASC_NODES: Record<string, AscNodeDef> = {
  edge: {
    id: 'edge',
    name: "Wanderer's Edge",
    costBase: 18,
    effect: 'damage',
    perRank: 0.037,
  },
  heft: {
    id: 'heft',
    name: 'Ironhand',
    costBase: 22,
    effect: 'gearPower',
    perRank: 0.037,
  },
  fury: {
    id: 'fury',
    name: 'Relentless',
    costBase: 34,
    effect: 'attackSpeed',
    // Unused: the bounded speed curve above sets this node's value.
    perRank: 0.037,
  },
};

/** Stable order → deterministic iteration over the tree. */
export const ASC_NODE_IDS: readonly string[] = ['edge', 'heft', 'fury'];

// --- Realm-local skills --------------------------------------------------
export interface SkillDef {
  id: string;
  name: string;
  /** Hero level at which the skill becomes purchasable. */
  unlockLevel: number;
}

/**
 * Five tracks, two of them live from level 0, the rest arriving inside the
 * first few minutes. Breadth is the point: the panel must answer "what do I
 * spend on next" without a greyed lock being the answer.
 */
export const SKILLS: Record<string, SkillDef> = {
  cleave: { id: 'cleave', name: 'Cleave', unlockLevel: 0 },
  warcry: { id: 'warcry', name: 'Warcry', unlockLevel: 0 },
  riposte: { id: 'riposte', name: 'Riposte', unlockLevel: 2 },
  sunder: { id: 'sunder', name: 'Sunder', unlockLevel: 6 },
  secondWind: { id: 'secondWind', name: 'Second Wind', unlockLevel: 14 },
};

/** Ordered skill ids (stable order → deterministic skillMult product). */
export const SKILL_IDS: readonly string[] = [
  'cleave',
  'warcry',
  'riposte',
  'sunder',
  'secondWind',
];
