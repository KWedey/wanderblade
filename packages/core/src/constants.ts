// Every tunable in one place. Values below are the M0-tuned economy: they were
// tuned in `sim/` against docs/ECONOMY.md's 10-day pacing targets.
//
// Naming: terse math symbols (hp0, rH, ...) mirror ECONOMY.md's formulas.

import type { Rarity } from './types';

// --- Enemies -------------------------------------------------------------
/** Enemy HP base: hp(z) = hp0 * rH^z */
export const hp0 = 10;
export const rH = 1.55;

/** Enemy gold base: gold(z) = g0 * rG^z (income grows slower than difficulty). */
export const g0 = 1;
export const rG = 1.48;

/**
 * Region boss HP multiplier: bossHp(z) = bossHpMult * hp(z).
 * Tuned to 60 (from the v0 guess of 25): the readiness bar is high enough that a
 * typical farmed gear set does NOT clear a gate on arrival — the hero parks and
 * farms the approach for a luckier drop mix, which is what turns each region end
 * into a real soft wall (see docs/ECONOMY.md). Kept below the all-epic ceiling
 * gearPowerBase*32 = 64: a maxed all-epic set gives readiness 72/60 = 1.2, above
 * the 1.1 auto-challenge bar, so the pure-idle player always breaks through via
 * farmed gear alone (DECISIONS.md #9); the autochallenge property test enforces it.
 */
export const bossHpMult = 60;

// --- Hero ----------------------------------------------------------------
/**
 * Hero base damage: base(level) = d0 * rD^level (the *smoothing* scaler).
 * d0 tuned to 25 (from the v0 guess of 5): with the low dropChance the soft walls
 * require, early gear is scarce, so the opening session leans on purchased levels
 * to fell the first boss inside the 5-10 min window. rD (1.12 < rH 1.55) still
 * fades base against enemy HP over zones, so gear stays the primary scaler past
 * the opening.
 */
export const d0 = 25;
export const rD = 1.12;

/** Hero level cost: levelCost(level) = levelCostBase * rC^level. */
export const levelCostBase = 10;
export const rC = 1.15;

/** Skill upgrade cost: skillCost(lvl) = skillCostBase * skillCostRate^lvl. */
export const skillCostBase = 50;
export const skillCostRate = 1.15;

/**
 * Each skill level contributes (1 + skillMultPerLevel * level) to the DPS
 * product. The multiplicative skill term used to be an *unbounded* power axis
 * (the greedy bot poured banked gold in, the product ran away, kill time floored
 * and every gate wall dissolved). It is now *bounded* by a per-skill maxLevel
 * (see SkillDef.maxLevel): at 0.05/rank and a cap of 10 ranks each skill tops out
 * at ×1.5, and both together at ×2.25 — a fixed, finite ceiling that cannot run
 * away. Skills are live in M0: a real, buyable second upgrade track with a hard
 * cap (see docs/ECONOMY.md "Skills in the M0 baseline").
 */
export const skillMultPerLevel = 0.05;

// --- Gear (the primary power scaler) -------------------------------------
/** Drop power: gearPowerBase * gearPowerRate^z * rarityMult. */
export const gearPowerBase = 2;
/** Gear power grows on the same base as enemy HP, so it tracks difficulty by construction. */
export const gearPowerRate = rH;

/**
 * Chance of a gear drop per kill. Tuned down from the v0 0.05 to 0.006. Because
 * gear power grows on the same base as enemy HP (gearPowerRate = rH), readiness
 * is scale-invariant: with frequent drops the equipped set tracks the frontier
 * and every gate either always clears (runaway to the float-precision tail) or
 * never does. Scarce drops make the equipped set *lag* the frontier by a variable
 * amount, so a gate clears only when a lucky recent, high-rarity mix lands — that
 * drop variance is what creates the farmable soft walls and paces the tail.
 */
export const dropChance = 0.006;

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

/** Rarity order used for the cumulative-weight roll. */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic'];

export const GEAR_SLOTS = ['weapon', 'armor', 'trinket'] as const;

// --- World structure -----------------------------------------------------
export const killsPerZone = 10;
export const zonesPerRegion = 10;
/** Regions in the v1 realm: Greenwood .. World's Edge (7th is the finale). */
export const regionsCount = 7;
/** Leagues gained per (non-parked) kill. Zone length = 1 league = 10 kills. */
export const leaguePerKill = 0.1;

// --- Boss gates ----------------------------------------------------------
/** Enrage window: Readiness = (dps * enrageWindowSec) / bossHp. */
export const enrageWindowSec = 30;
/** Auto-challenge fires (online or offline) once Readiness crosses this. */
export const autoChallengeReadiness = 1.1;
/** Cooldown after a failed manual challenge. */
export const bossRetryCooldownSec = 60;

// --- Combat pacing -------------------------------------------------------
/**
 * Walking floor: kill time is clamped to at least this many seconds. Held at 2.
 * With gates in every region (including the endless tail), the readiness walls —
 * not this floor — are the anti-runaway mechanism, so the floor was reconsidered
 * for a return toward its lower v0 value (0.3). The sim says keep 2: V1 (first
 * upgrade < 30 s) needs 10 gold within 30 s = 10 zone-0 kills, so 10 * floor < 30
 * pins the floor below 3; and lowering it only marches the hero into the
 * float-precision tail faster without improving any pacing target.
 */
export const minKillTimeSec = 2;

// --- Skills --------------------------------------------------------------
export interface SkillDef {
  id: string;
  name: string;
  /** Hero level at which the skill becomes purchasable. */
  unlockLevel: number;
  /**
   * Hard rank cap. buySkill refuses to sell past this, so skillMult is bounded:
   * at skillMultPerLevel=0.05 a cap of 10 tops each skill out at ×1.5 (both at
   * ×2.25). This ceiling is what keeps skills from running the DPS product away.
   */
  maxLevel: number;
}

/** v1 signature skills (bounded multiplier: each caps at ×1.5, both at ×2.25). */
export const SKILLS: Record<string, SkillDef> = {
  cleave: { id: 'cleave', name: 'Cleave', unlockLevel: 5, maxLevel: 10 },
  warcry: { id: 'warcry', name: 'Warcry', unlockLevel: 15, maxLevel: 10 },
};

/** Ordered skill ids (stable order → deterministic skillMult product). */
export const SKILL_IDS: readonly string[] = ['cleave', 'warcry'];
