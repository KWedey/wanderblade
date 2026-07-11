// Pure data types for the Wanderblade game core.
// No imports, no runtime code — the dependency-free root of the module graph.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type GearSlot = 'weapon' | 'armor' | 'trinket';

/** A single equippable item. `power` is the only stat (bigger = better). */
export interface GearItem {
  power: number;
  rarity: Rarity;
  /** Global zone index the drop was found in (for gear-set collection, M2). */
  zone: number;
}

export interface GearState {
  weapon: GearItem | null;
  armor: GearItem | null;
  trinket: GearItem | null;
}

export interface HeroState {
  level: number;
  /** skill id -> purchased level (0 = owned-but-unleveled / not yet bought). */
  skills: Record<string, number>;
}

export interface GateState {
  /** Parked at a region boss gate (farming the approach zone, leagues paused). */
  atGate: boolean;
  /** Game-time (seconds) before which a boss re-challenge is blocked. */
  cooldownUntilSec: number;
}

export interface LifetimeStats {
  kills: number;
  goldEarned: number;
  bossKills: number;
}

/**
 * The complete serializable game state. Every field is a plain number/string or
 * a nested plain object so `JSON.stringify` round-trips it exactly.
 */
export interface GameState {
  /** Seed the run was created from (kept for reference/debugging). */
  seed: number;
  /** Serialized mulberry32 stream position — advances one step per RNG draw. */
  rngState: number;
  /** Absolute game clock in seconds (total time requested across all advances). */
  timeSec: number;
  /**
   * Absolute game time at which the next kill completes. Persisting the kill
   * schedule as an absolute value (accumulated one kill at a time, never reset)
   * is what makes `advance(s, a+b)` exactly equal `advance(advance(s,a), b)`:
   * both paths add the same kill times in the same order and compare against the
   * same absolute target, so bit-identical kills are processed regardless of how
   * the interval is split. (A relative "time-left" carry would drift under
   * floating-point re-accumulation and break determinism.)
   */
  nextKillAtSec: number;
  /** Total kills ever — the RNG is keyed to this ordering. */
  killIndex: number;
  /** Global zone index (0-based), monotonically increasing along the road. */
  zone: number;
  /** Kills completed in the current zone (0..killsPerZone). */
  killsInZone: number;
  /** Leagues traveled (derived: leaguePerKill per non-parked kill). */
  leagues: number;
  gold: number;
  hero: HeroState;
  gear: GearState;
  gate: GateState;
  lifetime: LifetimeStats;
  /**
   * Set once the final region's boss falls. Past this point the road scales
   * endlessly (zones keep incrementing; gates still form at every region end) —
   * prototype behavior.
   */
  worldsEdgeReached: boolean;
}

/** Aggregate totals for a stretch of play (the "Back on the Road" recap). */
export interface Recap {
  seconds: number;
  kills: number;
  goldEarned: number;
  drops: number;
  equips: number;
  zonesEntered: number;
  regionsEntered: number;
  bossWins: number;
  leaguesTraveled: number;
}

/**
 * Discriminated union of everything that can happen during `advance`.
 * Each variant carries enough payload for both a recap and a UI log line.
 */
export type GameEvent =
  | { type: 'kill'; timeSec: number; zone: number; killIndex: number; gold: number }
  | {
      type: 'drop';
      timeSec: number;
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
  | { type: 'zone'; timeSec: number; zone: number; region: number }
  | { type: 'region'; timeSec: number; region: number; zone: number }
  | { type: 'gate'; timeSec: number; region: number; zone: number }
  | { type: 'bossWin'; timeSec: number; region: number; zone: number }
  | {
      type: 'bossFail';
      timeSec: number;
      region: number;
      zone: number;
      readiness: number;
      cooldownUntilSec: number;
    }
  | { type: 'edge'; timeSec: number; zone: number };

/**
 * `advance` returns a plain `GameEvent[]`, but also attaches the exact aggregate
 * `recap` for this stretch. The attachment guarantees recap counters stay
 * accurate even when the raw event array is capped for huge offline advances
 * (see `EVENT_CAP` in engine.ts). `summarizeEvents` prefers this attached recap.
 */
export type EventLog = GameEvent[] & { recap?: Recap };
