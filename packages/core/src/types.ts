// Pure data types for the Wanderblade game core.
// No imports, no runtime code — the dependency-free root of the module graph.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type GearSlot = 'weapon' | 'armor' | 'trinket';

/** The hero occupies exactly one phase at a time (DECISIONS.md #15). */
export type Phase = 'road' | 'boss';

/** A single equippable item. `power` is the only stat (bigger = better). */
export interface GearItem {
  power: number;
  rarity: Rarity;
  /** Realm the drop was found in (for gear-set collection, M4). */
  realm: number;
  /** Zone within that realm. */
  zone: number;
}

export interface GearState {
  weapon: GearItem | null;
  armor: GearItem | null;
  trinket: GearItem | null;
}

export interface HeroState {
  level: number;
  /** skill id -> purchased rank. Realm-local: reset on ascension. */
  skills: Record<string, number>;
}

/**
 * Momentum at the absolute instant `atSec`; live momentum is its decay from
 * there. Rewritten only at strike/catch instants — never at a kill, swing, or
 * advance boundary — so every decay uses split-identical operands.
 */
export interface MomentumState {
  value: number;
  atSec: number;
}

/** A point in arc space (see arcs.ts). */
export interface ArcPoint {
  x: number;
  y: number;
}

/** One Strike: an explicit timestamped input, with where it landed. */
export interface Strike {
  atSec: number;
  /** Aim point in arc space. A strike with no aim catches nothing. */
  aim: ArcPoint | null;
}

/**
 * A loot arc thrown by a kill. The kill already credited full base gold, so an
 * uncaught arc costs the idle player nothing; catching one pays the *bonus*
 * increment and may upgrade the gear it carries one rarity tier.
 */
export interface LootArc {
  /** Base gold this kill paid — the catch bonus is derived from it. */
  gold: number;
  /** Absolute time the arc lands; catchable strictly before this. */
  expiresAtSec: number;
  /** How far this arc flies, fixing its position at any instant. */
  landingX: number;
  /** Gear rolled by this kill, if any, at its un-upgraded rarity. */
  gear: { slot: GearSlot; rarity: Rarity; realm: number; zone: number } | null;
}

export interface BossState {
  /** Remaining guardian HP. Persists online and offline; no regeneration. */
  hpRemaining: number;
  /** Guardian HP at full — the abandon target. */
  hpMax: number;
  /** Absolute time the current attempt was entered, or null when on the Road. */
  enteredAtSec: number | null;
}

export interface AscendancyState {
  /**
   * Earned on the current Road. Cannot be spent. Banked exactly once, by
   * victory (docs/ECONOMY.md "Ascension transaction").
   */
  pending: number;
  /** Spendable persistent currency. Survives ascension. */
  banked: number;
  /** node id -> purchased rank. Survives ascension. */
  nodes: Record<string, number>;
  /**
   * Realms completed. Drives the automatic per-victory earnings bonus, which
   * multiplies gold and never enters the DPS formula.
   */
  victories: number;
}

/**
 * Persistent records. Survive ascension; grant no hidden combat power. Boss
 * trophies are `ascendancy.victories`; total kills are `killIndex`.
 */
export interface CollectionState {
  gearFound: number;
  zonesCleared: number;
  /** Lifetime kills per species index — the Bestiary's substrate. */
  speciesKills: number[];
}

export interface LifetimeStats {
  goldEarned: number;
  abandons: number;
  bossDamage: number;
}

/** Why a portal did not open. `unwinnable` means the guardian's HP is not finite. */
export type PortalRefusal = 'not-ready' | 'unwinnable';

export interface PortalEntry {
  entered: boolean;
  reason: PortalRefusal | null;
  events: GameEvent[];
}

/**
 * The complete serializable game state. Every field is a plain number/string/
 * boolean or a nested plain object or array of them, so `JSON.stringify`
 * round-trips it exactly.
 */
export interface GameState {
  /** Seed the run was created from (kept for reference/debugging). */
  seed: number;
  /** Serialized mulberry32 stream position — advances one step per RNG draw. */
  rngState: number;
  /** Absolute game clock in seconds (total time requested across all advances). */
  timeSec: number;
  /**
   * Absolute time of the next combat resolution — a Road kill or a boss swing.
   * Absolute, never a remaining-time carry: that is what makes a split advance
   * add identical intervals against an identical target (DECISIONS.md #6).
   */
  nextActionAtSec: number;
  /** Total kills ever — the RNG is keyed to this ordering, across realms. */
  killIndex: number;
  phase: Phase;
  /** Realm index (0-based). Increments on ascension only. */
  realm: number;
  /** Zone within the current realm (0..zonesPerRealm-1). Resets on ascension. */
  zone: number;
  /** Kills completed in the current zone (0..killsPerZone). */
  killsInZone: number;
  /** The realm's road is fully walked; the portal may be entered manually. */
  portalReady: boolean;
  /** Leagues traveled in the current realm. */
  leagues: number;
  gold: number;
  hero: HeroState;
  gear: GearState;
  boss: BossState;
  ascendancy: AscendancyState;
  momentum: MomentumState;
  /** Loot arcs currently in flight, oldest first. */
  arcs: LootArc[];
  collection: CollectionState;
  lifetime: LifetimeStats;
}

/** Aggregate totals for a stretch of play (the "Back on the Road" recap). */
export interface Recap {
  seconds: number;
  kills: number;
  goldEarned: number;
  drops: number;
  equips: number;
  arcCatches: number;
  zonesCleared: number;
  pendingAscendancyEarned: number;
  bossDamage: number;
  victories: number;
  leaguesTraveled: number;
}

/**
 * Boss swings are deliberately absent: a 90-minute guardian is thousands of
 * swings, so its damage aggregates into `Recap.bossDamage` instead.
 */
export type GameEvent =
  | {
      type: 'kill';
      timeSec: number;
      realm: number;
      zone: number;
      killIndex: number;
      gold: number;
      /** Index into `SPECIES` — what the client names and the Bestiary records. */
      species: number;
    }
  | {
      type: 'drop';
      timeSec: number;
      realm: number;
      zone: number;
      slot: GearSlot;
      rarity: Rarity;
      power: number;
      /** Whether this drop beat the equipped item and was auto-equipped. */
      equipped: boolean;
    }
  | {
      type: 'equip';
      timeSec: number;
      slot: GearSlot;
      power: number;
      rarity: Rarity;
      previousPower: number;
    }
  | {
      type: 'arcCatch';
      timeSec: number;
      bonusGold: number;
      /** Pending Ascendancy paid by the catch; 0 once the realm is portal-ready. */
      ascendancy: number;
      /** Whether the caught arc carried gear that gained a rarity tier. */
      upgraded: boolean;
    }
  | { type: 'zone'; timeSec: number; realm: number; zone: number }
  | { type: 'portalReady'; timeSec: number; realm: number }
  | { type: 'portalEnter'; timeSec: number; realm: number; bossHp: number }
  | { type: 'abandon'; timeSec: number; realm: number; hpRemaining: number }
  | {
      type: 'bossVictory';
      timeSec: number;
      realm: number;
      payout: number;
      pendingBanked: number;
    }
  | {
      type: 'ascend';
      timeSec: number;
      fromRealm: number;
      toRealm: number;
      banked: number;
      victories: number;
    };

/**
 * `advance` returns a plain `GameEvent[]`, but also attaches the exact aggregate
 * `recap` for this stretch. The attachment guarantees recap counters stay
 * accurate even when the raw event array is capped for huge offline advances
 * (see `EVENT_CAP` in engine.ts). `summarizeEvents` prefers this attached recap.
 */
export type EventLog = GameEvent[] & { recap?: Recap };
