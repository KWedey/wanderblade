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
  goldPeak: number;
  pendingAtVictory: number | null;
  bankedAfter: number | null;
  earningsMultAfter: number | null;
  treePurchasesTotal: number;
  /** Boss attempts walked away from inside this realm. */
  abandons: number;
}

/** One realm's road, walked by a player who never stops striking and one who never starts. */
export interface PortalReach {
  realm: number;
  idle: number | null;
  active: number | null;
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
 * could act on that instant; `reachSec` is how long the current income takes
 * to cover the cheapest priced gold row, 0 when one is already affordable.
 */
export interface ShopSample {
  timeSec: number;
  /** Taken inside an active session. Idle slices are looks nobody takes. */
  inSession: boolean;
  /** Seconds since this realm began — the grace window is measured from here. */
  sinceRealmStartSec: number;
  realm: number;
  affordable: number;
  priced: number;
  reachSec: number;
}

/** What the spend-depth validator reports (docs/DECISIONS.md #63 scarcity). */
export interface SpendDepth {
  /** Samples taken past the post-ascension grace window. */
  counted: number;
  /** Rows carrying a real price at the leanest look — gold cannot move this. */
  minPriced: number;
  /** Share of looks with at most SPEND_LEAN_MAX affordable rows — the scarcity clause. */
  leanFraction: number;
  /** Share of looks with a row affordable or within SPEND_REACH_SEC of income. */
  reachFraction: number;
  /** Realm with the most looks where nothing was within reach. */
  worstRealm: number;
  /** Longest unbroken stretch, in seconds, with nothing within reach. */
  longestDroughtSec: number;
}

/** What active play buys in permanent currency, against the same span idle. */
/** One checkpoint of the active/idle multiple, or why it could not be taken. */
export interface HorizonPoint {
  sec: number;
  /** null when the comparison cannot be taken here. */
  ratio: number | null;
  /** `content-end`: a run ran out of ladder. `run-length`: the run stopped first. */
  blocked: 'content-end' | 'run-length' | null;
}

export interface PermanentUplift {
  /** The horizon the band is *stated* at — a fixed checkpoint, not the run length. */
  horizonSec: number;
  /** Whether both runs actually reached it. False leaves the ratio unbanded. */
  reachedHorizon: boolean;
  /** Where the ratio was actually taken, which equals `horizonSec` when reached. */
  measuredAtSec: number;
  idleEarned: number;
  activeEarned: number;
  /** Active Ascendancy earned over idle. */
  ratio: number;
  idleFirstAscensionSec: number | null;
  activeFirstAscensionSec: number | null;
  /** Tree depth both runs are compared at. */
  rankTarget: number;
  idleRankSec: number | null;
  activeRankSec: number | null;
  /** The multiple at each checkpoint inside the run. Reported, never banded. */
  sweep: HorizonPoint[];
  /** Realm where whichever run ended first ran out of content, if either did. */
  contentEndRealm: number | null;
  /** When that happened. The comparison cannot be carried past it. */
  contentEndSec: number | null;
}

/** How often a realm's milestone beats happen while the player is actually there. */
export interface WitnessedBeats {
  /** Session share of wall clock — where beats land by chance alone. */
  baseline: number;
  beats: { name: string; inSession: number; total: number }[];
}

/** Time spent on a realm whose portal is open but not yet entered. */
export interface DeadTime {
  /** Longest single portal-ready wait, in seconds. */
  longestSec: number;
  /** Realm holding it. */
  worstRealm: number;
  /** Share of total Road time spent portal-ready and waiting. */
  fraction: number;
  /** Slowest realm, in days from its start to its victory. */
  slowestRealmDays: number;
  slowestRealm: number;
  realms: number;
}

/** One direct correctness experiment's verdict. */
export interface Check {
  pass: boolean;
  detail: string;
}

/**
 * A single validator verdict. `skipped` means the run never measured it
 * (`--quick`), so `pass` is false and the summary leaves it out of its count.
 */
export interface ValidatorResult {
  id: string;
  name: string;
  pass: boolean;
  skipped: boolean;
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
  /**
   * Realm start → portal available for each policy, at the realms P5 bands
   * directly: the tutorial realm and the first full-length one.
   */
  portalReach: PortalReach[];
  /** Prompt ascension versus farming a ready realm twice as long. */
  promptVsOverfarm: { promptBanked: number; overfarmBanked: number; horizonSec: number } | null;
  /** Abandoning an underprepared attempt versus farming the road instead. */
  abandonProbe: {
    investedSec: number;
    lostBossSec: number;
    roadGoldGained: number;
    etaImprovement: number;
  } | null;
  /** Realm whose guardian is unwinnable, if the headline run reached the frontier. */
  frontierRealm: number | null;
  /** When the headline run stopped there. */
  frontierSec: number | null;
  /** How much the upgrade panel offered across the run. */
  spendDepth: SpendDepth;
  /** Time parked on an open portal, and how far realm cadence degraded. */
  deadTime: DeadTime;
  /** What active play bought in permanent currency. */
  permanentUplift: PermanentUplift | null;
  /** Which milestone beats the player was present for. Reported, never banded. */
  witnessed: WitnessedBeats | null;
  totalKills: number;
  finalRealm: number;
  victories: number;

  /** Every kind of phase-contract breach seen live; empty is the passing case. */
  correctnessBreaches: BreachKind[];
  /** Readable detail for those breaches, capped at 20 lines. */
  correctnessLive: string[];
  /** The direct experiments; null when `--quick` left them unmeasured. */
  offlineMatchesLive: Check | null;
  replayIdentical: Check | null;
  abandonClean: Check | null;
  remainingTimeCarried: Check | null;
  earningsBonusIsolated: Check | null;
}
