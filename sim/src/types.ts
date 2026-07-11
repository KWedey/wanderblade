// Shared sim-harness types. No runtime code.

/** Parsed CLI configuration. */
export interface SimConfig {
  days: number;
  seed: number;
  seeds: number;
  checkinsPerDay: number;
  csv: boolean;
}

/** One discrete check-in (post active-session touch of the bot player). */
export interface CheckinRecord {
  index: number;
  timeSec: number;
  day: number;
  /** Whether this check-in falls after the first 24h (validator 3 scope). */
  afterDay1: boolean;
  /** Zone / region as the player returns, before spending. */
  arrivalZone: number;
  arrivalRegion: number;
  arrivalGold: number;
  leagues: number;
  heroLevel: number;
  gearPower: number;
  dps: number;
  readiness: number;
  /** Purchases the bot made this check-in. */
  purchases: number;
  /** If this check-in seeded an 8h-return probe, its purchase count. */
  eightHourProbePurchases: number | null;
}

/** Per-gate wall timing (region boss gate). */
export interface GateRecord {
  region: number;
  zone: number;
  formSec: number;
  crossSec: number | null;
  /** Seconds parked at the gate (crossSec - formSec), or run-end lower bound. */
  parkedSec: number;
  crossed: boolean;
}

/** A single PASS/FAIL target result for one seed. */
export interface ValidatorResult {
  id: number;
  name: string;
  pass: boolean;
  /** Soft warning (still a PASS, but flagged — e.g. boss down too fast). */
  warn: boolean;
  detail: string;
}

/** Everything measured for one seed's 10-day run. */
export interface SeedResult {
  seed: number;
  config: SimConfig;
  checkins: CheckinRecord[];
  gates: GateRecord[];
  validators: ValidatorResult[];
  // Headline milestones.
  firstPurchaseSec: number | null;
  firstBossSec: number | null;
  firstBossTooFast: boolean;
  maxTrashKillTime: number;
  maxTrashKillTimeZone: number;
  maxTrashKillTimeSec: number;
  finalZone: number;
  finalRegion: number;
  finalLeagues: number;
  finalGold: number;
  worldsEdgeReached: boolean;
  totalKills: number;
  totalGold: number;
  totalDrops: number;
  totalEquips: number;
  activeSessionPurchases: number;
  /** Median purchases across all 8h-return probes. */
  eightHourMedian: number;
  eightHourSamples: number[];
}
