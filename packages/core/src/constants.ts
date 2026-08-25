// Every tunable in one place. Values are tuned in `sim/` against the pacing
// bands in docs/ACTIVE-PLAY.md and the validators in docs/ECONOMY.md.
//
// Naming: terse math symbols (hp0, rH, ...) mirror ECONOMY.md's formulas.

import type { Rarity } from './types';

// --- Realm scaling -------------------------------------------------------
/**
 * Scales every gold- and power-denominated quantity by `REALM_STEP^realm`,
 * making a realm ratio-identical to realm 0. Ascendancy and the earnings bonus
 * are then the only cross-realm asymmetries (docs/DECISIONS.md #19).
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

/** Each realm-local skill rank contributes (1 + this * rank) to the DPS product. */
export const skillMultPerLevel = 0.05;

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
 * Tuned to 0.6 so a capped boss fight lands mid-band (1.4x-1.8x faster).
 */
export const MOMENTUM_MAX_BONUS = 0.75;

// --- Loot arcs (the Road's active gold layer) ----------------------------
/** Seconds a kill's loot arc stays catchable. */
export const ARC_FLIGHT_SEC = 1.5;
/**
 * A caught arc pays this multiple of its base gold. The kill already credited
 * 1.0x at full value, so a catch pays only the increment and idle loses nothing.
 * Tuned with MOMENTUM_MAX_BONUS so capped Road play lands at 1.75 * 1.15 ~= 2.0x.
 */
export const ARC_CATCH_MULT = 1.15;

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
 * an already portal-ready realm earns none of it (docs/DECISIONS.md #20).
 */
export const ASC_PER_ZONE = 1;
/** Guardian victory payout, the dominant share of a realm's Ascendancy. */
export const ASC_BOSS_PAYOUT = 8;
/** Both accruals grow linearly per realm: amount * (1 + this * realm). */
export const ASC_REALM_GROWTH = 0.5;

/** Automatic per-victory bonus to gold and passive earnings. Never touches DPS. */
export const EARNINGS_BONUS_PER_VICTORY = 0.15;

export interface AscNodeDef {
  id: string;
  name: string;
  maxRank: number;
  /** Rank r costs costBase * costRate^r banked Ascendancy. */
  costBase: number;
  costRate: number;
  effect: 'damage' | 'gearPower' | 'attackSpeed';
  perRank: number;
}

/** The persistent combat tree — the only source of persistent combat power. */
export const ASC_NODES: Record<string, AscNodeDef> = {
  edge: {
    id: 'edge',
    name: "Wanderer's Edge",
    maxRank: 12,
    costBase: 18,
    costRate: 1.6,
    effect: 'damage',
    perRank: 0.12,
  },
  heft: {
    id: 'heft',
    name: 'Ironhand',
    maxRank: 12,
    costBase: 22,
    costRate: 1.6,
    effect: 'gearPower',
    perRank: 0.12,
  },
  fury: {
    id: 'fury',
    name: 'Relentless',
    maxRank: 8,
    costBase: 34,
    costRate: 1.75,
    effect: 'attackSpeed',
    perRank: 0.05,
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
  /** Hard rank cap, so skillMult stays bounded and cannot run the DPS away. */
  maxLevel: number;
}

export const SKILLS: Record<string, SkillDef> = {
  cleave: { id: 'cleave', name: 'Cleave', unlockLevel: 5, maxLevel: 10 },
  warcry: { id: 'warcry', name: 'Warcry', unlockLevel: 15, maxLevel: 10 },
};

/** Ordered skill ids (stable order → deterministic skillMult product). */
export const SKILL_IDS: readonly string[] = ['cleave', 'warcry'];
