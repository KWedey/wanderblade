// Every tunable in one place. Values are tuned in `sim/` against the pacing
// bands in docs/ACTIVE-PLAY.md and the validators in docs/ECONOMY.md.
//
// Naming: terse math symbols (hp0, rH, ...) mirror ECONOMY.md's formulas.

import type { GearSlot, Rarity } from './types';

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

/**
 * Enemy gold: gold(realm, z) = g0 * REALM_STEP^realm * rG^z.
 *
 * `rG` is `rH^(ln rC / ln rD)`: the zone's gold grows exactly as fast as the
 * levels needed to keep pace with its HP cost, so a hero who reinvests keeps
 * the same kill time on every zone. Income then answers purchases instead of
 * the zone index, which is what keeps the upgrade panel scarce rather than
 * all-green (docs/DECISIONS.md #64).
 */
export const g0 = 1;
export const rG = 1.75;

// --- Hero ----------------------------------------------------------------
/**
 * Hero base damage: base(level) = d0 * rD^level, scaled by the realm.
 * A level is a big, rare buy — two per zone, not four — so the hero row costs
 * more than one glance's income and is not green at every look (#64).
 */
export const d0 = 10;
export const rD = 1.25;

/**
 * Hero level cost: levelCost(level) = levelCostBase * rC^level, realm-scaled.
 * Cost outgrows damage (1.33 vs 1.25), so gold buys damage at elasticity 0.78
 * and the per-victory earnings bonus lands on DPS as x1.12, which
 * `BOSS_REALM_GAIN` absorbs (docs/DECISIONS.md #32).
 */
export const levelCostBase = 100;
export const rC = 1.33;

// --- Gear (the idle half of realm-local power) ---------------------------
/**
 * Drop power: gearPowerBase * REALM_STEP^realm * gearPowerRate^z * rarityMult.
 * Gear tracks enemy HP zone for zone, so a hero who buys nothing still walks:
 * it is what idle progress runs on. Bought damage is the other half, so a
 * purchase still moves the kill time and the panel stays scarce
 * (docs/DECISIONS.md #64).
 */
export const gearPowerBase = 1.2;
/** Gear power grows on the same base as enemy HP, so it tracks difficulty. */
export const gearPowerRate = rH;

/**
 * Gear drops per zone, whatever the zone's length. Kept scarce: gear power
 * grows on enemy HP's base, so frequent drops make the equipped set track the
 * frontier exactly and every boss becomes the same fight. Stated per zone
 * rather than per kill because zone length is a function of the realm
 * (`killsPerZoneFor`), and the kit's lag behind the frontier is what matters.
 */
export const DROPS_PER_ZONE = 10;

// --- Monster variety -----------------------------------------------------
export interface SpeciesDef {
  /** Payout multiplier. The roster's mean is exactly 1, so no band moves. */
  goldMult: number;
  /** Drop-chance multiplier — what gives a Bestiary something to differentiate. */
  dropMult: number;
}

/**
 * Slots, not creatures: the SRD roster and its naming are M4 content
 * (docs/SRD-CONTENT.md). What lives here is the shape a zone's monsters vary
 * along, so three names in the log stop reading as three identical numbers.
 *
 * `goldMult` sums to exactly the roster length, so mean payout per kill is
 * unchanged and the pacing bands cannot move. `dropMult` deliberately does not
 * track gold — the richest monster is not the most generous one.
 */
export const SPECIES: readonly SpeciesDef[] = [
  { goldMult: 0.7, dropMult: 1.6 },
  { goldMult: 0.85, dropMult: 0.7 },
  { goldMult: 1.0, dropMult: 1.0 },
  { goldMult: 1.15, dropMult: 1.3 },
  { goldMult: 1.3, dropMult: 0.4 },
];

/** Rarity roll weights; the roll is scaled by their sum, so they need not total 100. */
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

/**
 * What a slot contributes to the same drop. Without it `gearPower` is purely
 * positional, so two items rolled in the same zone at the same rarity are
 * bit-identical — measured on 43.2% of looks — and a player reading two
 * different names beside one number correctly infers the names are decoration.
 *
 * The weights sum to exactly `GEAR_SLOTS.length`, so `gearPowerTotal` is
 * unchanged in expectation and no pacing band moves. Same construction as
 * `SPECIES` (docs/DECISIONS.md #37, #40).
 */
export const SLOT_POWER: Record<GearSlot, number> = {
  weapon: 1.15,
  armor: 1.0,
  trinket: 0.85,
};

// --- Realm structure -----------------------------------------------------
/**
 * Realm length grows with realm index (docs/DECISIONS.md #63): realm 0 is a
 * tutorial the first session finishes, realms FULL_LENGTH_REALM and up hold the
 * full ladder. `pacing.ts` interpolates between the two ends.
 */
export const FULL_LENGTH_REALM = 5;
export const ZONES_REALM0 = 10;
/** Zones in a full-length realm's road. */
export const ZONES_FULL = 50;
export const KILLS_PER_ZONE_REALM0 = 250;
export const KILLS_PER_ZONE_FULL = 500;

/** Realm start → portal available, in seconds, at both ends of the ramp. */
export const PORTAL_BAND_REALM0_SEC = {
  active: { minSec: 12 * 60, maxSec: 20 * 60 },
  idle: { minSec: 40 * 60, maxSec: 80 * 60 },
} as const;
export const PORTAL_BAND_FULL_SEC = {
  active: { minSec: 2 * 3600, maxSec: 4 * 3600 },
  idle: { minSec: 8 * 3600, maxSec: 16 * 3600 },
} as const;

// --- Combat pacing -------------------------------------------------------
/**
 * Idle walking floor for a Road kill, in seconds. Momentum divides *through*
 * this floor (see `killTime`), so active play is never capped by it. It is
 * also the ceiling on how fast a bonus-laden deep realm can run, which is what
 * keeps realm cadence slow enough for a realm lead to mean anything (P10).
 */
export const minKillTimeSec = 0.7;

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
 * Kills are slower than strikes now that the hero is damage-bound rather than
 * floor-bound (docs/DECISIONS.md #64), so the reference player catches most
 * coins and the multiple, not the strike rate, sets the Road-active band.
 * Momentum's x1.75 times a full catch caps at 1.75 * this; P1 bands 1.8–2.2.
 */
export const ARC_CATCH_MULT = 1.25;
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

/**
 * How far one coin's share may sit from an even split, as a fraction: shares
 * run 0.55x to 1.45x of `gold / n` before normalisation. Wide enough that two
 * coins from one kill differ at the three significant figures the HUD prints —
 * an even split gave a zone only `SPECIES.length x split counts` = 15 distinct
 * payouts, and a player watching the same number recur every few rows concludes
 * the log is fake. The weights are normalised, so the kill's total is exactly
 * what it was.
 */
export const COIN_SHARE_SPREAD = 0.45;

/** Arc space reach: the nearest and furthest an arc lands from the hero. */
export const ARC_MIN_REACH = 0.5;
export const ARC_MAX_REACH = 1.5;
/**
 * The catch window is constant in **time**, not in distance: the radius is this
 * many seconds of the coin's own travel. A fixed distance is silently generous
 * at the apex, where vertical speed passes through zero, and near-zero close to
 * the ground where it peaks — a 100x swing at human reaction speed, on
 * knowledge the game never communicates (docs/DECISIONS.md #35).
 */
export const ARC_CATCH_SEC = 0.3;

/**
 * Half-width of the catch window *across* the coin's path, in arc units.
 *
 * One circle at one instant is simultaneously the aim tolerance and the timing
 * tolerance, so tightening either tightens both — which is why no value of
 * `ARC_CATCH_SEC` alone could make aim matter without making the mechanic a
 * reflex-time lottery. Latency displaces a tap *along* the path; a stray tap
 * scatters in every direction. Splitting the two axes is the shape the physics
 * implied (`docs/DECISIONS.md` #45), and it is not a cap: the along-path window
 * stays constant in time at every speed, so #35 is untouched.
 */
export const ARC_CATCH_PERP = 0.1;

// --- Portal guardian -----------------------------------------------------
/**
 * Guardian HP = bossHpMultFor(realm) * enemyHp(realm, last zone) * BOSS_REALM_GAIN^realm.
 * The multiple ramps with the realm like its road does, so the opening guardian
 * falls inside the first session and the deep ones keep their old fights.
 */
export const bossHpMultRealm0 = 1300;
export const bossHpMultFull = 16000;
/**
 * Guardians scale slightly faster than their realm, absorbing both the earnings
 * bonus that funds hero levels and the Ascendancy tree's compounding damage.
 *
 * ⚠️ P6's 90-minute ceiling has about **0.6 minutes of headroom**: per-seed
 * maxima run 87.6 / 89.4 / 88.2 / 89.4 / 89.4 / 88.2. Anything that raises
 * guardian HP or lowers hero DPS turns P6 red, including changes with nothing
 * to do with boss tuning — the margin, not your change, is usually the cause.
 */
export const BOSS_REALM_GAIN = 1.19;

/**
 * How long a prepared build's fight should last at sustained full momentum, in
 * seconds, at both ends of the ramp. The ceiling doubles as the entry rule: the
 * modelled player farms on past it (docs/DECISIONS.md #24).
 */
export const BOSS_BAND_REALM0_SEC = { minSec: 3 * 60, maxSec: 6 * 60 } as const;
export const BOSS_BAND_FULL_SEC = { minSec: 15 * 60, maxSec: 90 * 60 } as const;

// --- Ascendancy ----------------------------------------------------------
/**
 * Pending Ascendancy is granted per zone cleared, never per second, so farming
 * an already portal-ready realm earns none of it (docs/DECISIONS.md #22).
 */
export const ASC_PER_ZONE = 1;
/** Guardian victory payout, the dominant share of a realm's Ascendancy. */
export const ASC_BOSS_PAYOUT = 8;
/**
 * Catching every coin a zone throws pays this multiple of the zone's own
 * Ascendancy on top of it; one coin pays its share of that. Stated against the
 * zone rather than as a flat number so it inherits realm scaling and zone
 * length (`killsPerZoneFor`) for free.
 *
 * Active play has to buy the *permanent* currency, not a bigger pile of the
 * temporary one: no multiplier on gold can beat a night of idle, because idle
 * has all night. Ascendancy per realm is bounded — its zones and one guardian,
 * and a portal-ready realm pays nothing — so catches are the only way to raise
 * a realm's yield, and waiting cannot substitute for them.
 */
export const ASC_CATCH_ZONE_BONUS = 16;
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

interface AscNodeBase {
  id: string;
  name: string;
  /** Rank r costs costBase * (1 + ASC_COST_STEP * r) banked Ascendancy. */
  costBase: number;
}

/**
 * Damage and gear power compound: each rank multiplies its effect by
 * (1 + perRank). Attack speed follows the bounded ASC_SPEED_MAX_BONUS/DECAY
 * curve instead and so carries no per-rank factor.
 */
export type AscNodeDef =
  | (AscNodeBase & { effect: 'damage' | 'gearPower'; perRank: number })
  | (AscNodeBase & { effect: 'attackSpeed' });

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
  /** Rank-0 price, before the realm scale. */
  costBase: number;
  /** Price of rank n is costBase * costRate^n — the skill's own geometry. */
  costRate: number;
  /** The DPS factor this skill approaches: 1 + maxBonus, never past it. */
  maxBonus: number;
  /** Fraction of the gap left standing per rank. Lower matures faster. */
  decay: number;
}

/**
 * Five tracks, two of them live from level 0, the rest arriving inside the
 * first few minutes. Breadth is the point: the panel must answer "what do I
 * spend on next" without a greyed lock being the answer.
 *
 * Each track has its own price and its own curve, so they are not five copies
 * of one decision. Price steps are steep and graduated (x4 through x324) so a
 * bought rank leaves the panel for a while instead of sitting green at the
 * next glance; the ceilings multiply to 2.25x (docs/DECISIONS.md #64).
 */
export const SKILLS: Record<string, SkillDef> = {
  cleave: {
    id: 'cleave', name: 'Cleave', unlockLevel: 0,
    costBase: 60, costRate: 4, maxBonus: 0.12, decay: 0.78,
  },
  warcry: {
    id: 'warcry', name: 'Warcry', unlockLevel: 0,
    costBase: 120, costRate: 12, maxBonus: 0.23, decay: 0.93,
  },
  riposte: {
    id: 'riposte', name: 'Riposte', unlockLevel: 2,
    costBase: 250, costRate: 36, maxBonus: 0.17, decay: 0.86,
  },
  sunder: {
    id: 'sunder', name: 'Sunder', unlockLevel: 6,
    costBase: 500, costRate: 108, maxBonus: 0.27, decay: 0.95,
  },
  secondWind: {
    id: 'secondWind', name: 'Second Wind', unlockLevel: 12,
    costBase: 1000, costRate: 324, maxBonus: 0.10, decay: 0.72,
  },
};

/** Ordered skill ids (stable order → deterministic skillMult product). */
export const SKILL_IDS: readonly string[] = [
  'cleave',
  'warcry',
  'riposte',
  'sunder',
  'secondWind',
];

/** The ceiling `skillMult` approaches with every track at infinite rank. */
export const SKILL_MULT_CEILING = SKILL_IDS.reduce(
  (m, id) => m * (1 + (SKILLS[id]?.maxBonus ?? 0)),
  1,
);
