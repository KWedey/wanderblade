// Shared sim-harness types. No runtime code.

/** Parsed CLI configuration. */
export interface SimConfig {
  days: number;
  seed: number;
  seeds: number;
  /** Minutes per active session. */
  sessionMin: number;
  /** Active sessions per day. */
  sessionsPerDay: number;
  csv: boolean;
  /** Skip the multi-realm and long-return probes; keep the fast pacing ones. */
  quick: boolean;
}

/** Which player is being simulated. */
export type PolicyName = 'road-idle' | 'road-active';

/**
 * A phase-contract breach the live watch can see. Validators match on these,
 * not on the human-readable message list, which is capped.
 */
export type BreachKind = 'auto-entry' | 'boss-income' | 'hp-regen' | 'non-finite';

/** One realm's full Road → Portal Boss → Ascension lifecycle. */
export interface RealmRecord {
  realm: number;
  startSec: number;
  portalReadySec: number | null;
  portalEnterSec: number | null;
  victorySec: number | null;
  /** Seconds spent on the Road before entering (includes any overfarm). */
  roadSec: number | null;
  /** Seconds spent in the boss phase across all attempts. */
  bossSec: number;
  /** Active (striking) seconds inside this realm. */
  activeSec: number;
  /** Predicted seconds-to-kill at entry, at zero momentum. */
  bossEtaAtEntrySec: number | null;
  /** The same prediction at sustained full momentum — the fight's active length. */
  bossActiveEtaAtEntrySec: number | null;
  gearPowerAtEntry: number;
  dpsAtEntry: number;
  goldPeak: number;
  pendingAtVictory: number | null;
  bankedAfter: number | null;
  earningsMultAfter: number | null;
  treePurchasesTotal: number;
}

/** A periodic snapshot of the run, for the CSV timeline. */
export interface Sample {
  timeSec: number;
  phase: string;
  realm: number;
  zone: number;
  gold: number;
  gearPower: number;
  dps: number;
  heroLevel: number;
  pending: number;
  banked: number;
  bossHpFrac: number;
  earningsMult: number;
}

/**
 * One look at the upgrade panel, taken before any purchase loop ran. `priced`
 * counts rows carrying a real price; `affordable` counts the ones the player
 * could act on that instant.
 */
export interface ShopSample {
  timeSec: number;
  /** Seconds since this realm began — the grace window is measured from here. */
  sinceRealmStartSec: number;
  realm: number;
  affordable: number;
  priced: number;
}

/** What the spend-depth validator reports. */
export interface SpendDepth {
  /** Samples taken past the post-ascension grace window. */
  counted: number;
  minAffordable: number;
  /** Rows carrying a real price at the leanest look — gold cannot move this. */
  minPriced: number;
  /** Realm holding `minAffordable`. */
  worstRealm: number;
  /** Share of looks offering the target number of affordable rows or more. */
  richFraction: number;
  /** Share of counted samples with fewer than two things to buy. */
  starvedFraction: number;
  /** Longest unbroken stretch, in seconds, with fewer than two things to buy. */
  longestStarvedSec: number;
}

/** A single PASS/FAIL result. */
export interface ValidatorResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

/** A controlled A/B measurement taken from a cloned mid-run state. */
export interface Uplift {
  label: string;
  idle: number;
  active: number;
  ratio: number;
}

/** Everything measured for one seed's run. */
export interface SeedResult {
  seed: number;
  config: SimConfig;
  realms: RealmRecord[];
  samples: Sample[];
  correctness: ValidatorResult[];
  pacing: ValidatorResult[];
  /** Income-rate multiplier over 20 minutes, road position held. */
  roadUplift: Uplift[];
  /** The same window with road progression left in. Reported, not banded. */
  roadWindowUplift: Uplift[];
  /** Guardian time-to-kill from the same build: zero taps vs capped-rate strikes. */
  bossUplift: Uplift[];
  /** Upgrades affordable after an 8-hour idle return. */
  eightHourBuys: number[];
  /** Zones of road progress after a 24-hour idle return. */
  twentyFourHourZones: number[];
  /** Realm 0 start → portal available, for each policy. */
  portalReachSec: { idle: number | null; active: number | null };
  /** Prompt ascension versus farming a ready realm twice as long. */
  promptVsOverfarm: { promptBanked: number; overfarmBanked: number; horizonSec: number } | null;
  /** Abandoning an underprepared attempt versus farming the road instead. */
  abandonProbe: {
    investedSec: number;
    lostBossSec: number;
    roadGoldGained: number;
    etaImprovement: number;
  } | null;
  /** How much the upgrade panel offered across the run. */
  spendDepth: SpendDepth;
  totalKills: number;
  finalRealm: number;
  victories: number;

  /** Every kind of phase-contract breach seen live; empty is the passing case. */
  correctnessBreaches: BreachKind[];
  /** Readable detail for those breaches, capped at 20 lines. */
  correctnessLive: string[];
  offlineMatchesLive: boolean;
  offlineMatchesLiveDetail: string;
  replayIdentical: boolean;
  replayIdenticalDetail: string;
  abandonClean: boolean;
  abandonCleanDetail: string;
  remainingTimeCarried: boolean;
  remainingTimeCarriedDetail: string;
  earningsBonusIsolated: boolean;
  earningsBonusIsolatedDetail: string;
}
