// Controlled A/B experiments. Each probe clones one mid-run state and runs the
// two policies from identical inputs, so the measured ratio is caused by the
// player's input and nothing else.

import {
  abandonBoss,
  advance,
  bossEtaSec,
  enterPortal,
  gearPower,
  GEAR_SLOTS,
  type GameState,
} from '@wanderblade/core';
import { botTouch } from './bot';
import { CAP_RATE, IDLE_SLICE_SEC, SEC_PER_DAY, SEC_PER_HOUR, strikeThrough } from './policy';
import { clone, runPlayer, timeToKill, totalEarned, type RunOptions } from './simulate';
import type {
  DeadTime,
  HorizonPoint,
  PermanentUplift,
  WitnessedBeats,
  RealmRecord,
  ShopSample,
  SimConfig,
  SpendDepth,
  Uplift,
} from './types';

const ROAD_WINDOW_SEC = 20 * 60;

/** Guardians are allowed a long time to fall before a probe gives up. */
const BOSS_PROBE_CAP_SEC = 30 * SEC_PER_DAY;

/**
 * Pin the build and the road position: an open portal stops zone advance, and
 * a best-in-zone epic in every slot means no drop can improve on what is worn.
 */
function freeze(s: GameState): GameState {
  s.portalReady = true;
  for (const slot of GEAR_SLOTS) {
    const power = gearPower(s.realm, s.zone, 'epic', slot);
    const worn = s.gear[slot];
    if (worn === null || worn.power < power) {
      s.gear[slot] = { power, rarity: 'epic', realm: s.realm, zone: s.zone };
    }
  }
  return s;
}

/** Gold earned over `seconds`, striking at `rate`, with purchases suspended. */
function goldOver(start: GameState, seconds: number, rate: number): number {
  const s = clone(start);
  const before = s.lifetime.goldEarned;
  strikeThrough(s, seconds, rate);
  return s.lifetime.goldEarned - before;
}

/**
 * The income-rate multiplier the band describes: Road gold over 20 minutes,
 * capped-rate strikes versus idle, from a frozen build at a frozen position.
 * Advancing faster also earns upgrades and richer zones faster, and that
 * compounding is unbounded by construction — `roadWindowUplift` reports it
 * separately rather than letting it contaminate the multiplier.
 */
export function roadUplift(states: GameState[]): Uplift[] {
  return states.map((s, i) => {
    const held = freeze(clone(s));
    const idle = goldOver(held, ROAD_WINDOW_SEC, 0);
    const active = goldOver(held, ROAD_WINDOW_SEC, CAP_RATE);
    return {
      label: `realm ${s.realm} zone ${s.zone} (#${i + 1})`,
      idle,
      active,
      ratio: idle > 0 ? active / idle : NaN,
    };
  });
}

/** The same 20-minute window with road progression left in. Context, not a band. */
export function roadWindowUplift(states: GameState[]): Uplift[] {
  return states.map((s, i) => {
    const idle = goldOver(s, ROAD_WINDOW_SEC, 0);
    const active = goldOver(s, ROAD_WINDOW_SEC, CAP_RATE);
    return {
      label: `realm ${s.realm} zone ${s.zone} (#${i + 1})`,
      idle,
      active,
      ratio: idle > 0 ? active / idle : NaN,
    };
  });
}

/** Guardian time-to-kill from one committed build: zero taps versus capped. */
export function bossUplift(entryStates: GameState[]): Uplift[] {
  const out: Uplift[] = [];
  for (const s of entryStates) {
    const idle = timeToKill(s, 0, BOSS_PROBE_CAP_SEC);
    const active = timeToKill(s, CAP_RATE, BOSS_PROBE_CAP_SEC);
    if (idle === null || active === null) continue;
    out.push({
      label: `realm ${s.realm}`,
      idle,
      active,
      ratio: active > 0 ? idle / active : NaN,
    });
  }
  return out;
}

/** Upgrades affordable after an 8-hour idle return. */
export function eightHourReturn(states: GameState[]): number[] {
  return states.map((start) => {
    const s = clone(start);
    advance(s, 8 * SEC_PER_HOUR);
    const bought = botTouch(s);
    return bought.gold + bought.tree;
  });
}

/**
 * Zones of road progress after a 24-hour idle return. No purchases are made
 * inside the window — a player who is away cannot buy anything, so spending
 * gold mid-gap would measure a session, not a return.
 */
export function twentyFourHourReturn(states: GameState[]): number[] {
  return states.map((start) => {
    const s = clone(start);
    const before = s.collection.zonesCleared;
    advance(s, 24 * SEC_PER_HOUR);
    return s.collection.zonesCleared - before;
  });
}

/**
 * Ascend promptly versus farming an already-open realm for twice its road time.
 * Both players are measured at the same wall-clock horizon.
 */
export function promptVsOverfarm(
  seed: number,
  config: SimConfig,
): { promptBanked: number; overfarmBanked: number; horizonSec: number } | null {
  const base: RunOptions = { policy: 'road-active', entry: 'prompt' };
  const prompt = runPlayer(seed, config, base);
  const over = runPlayer(seed, config, { ...base, entry: 'overfarm-2x' });
  if (prompt.state.timeSec <= 0) return null;
  // Total earned, not the leftover balance: the tree is an uncapped sink, so a
  // balance comparison measures who spent less, not who earned more.
  return {
    promptBanked: totalEarned(prompt.state),
    overfarmBanked: totalEarned(over.state),
    horizonSec: Math.min(prompt.state.timeSec, over.state.timeSec),
  };
}

/**
 * The cost of an underprepared commitment: enter, fight a while, abandon, and
 * compare the forfeited boss damage against what the same time on the Road buys.
 */
export function abandonProbe(
  portalReadyState: GameState,
): { investedSec: number; lostBossSec: number; roadGoldGained: number; etaImprovement: number } | null {
  const attempt = clone(portalReadyState);
  if (!enterPortal(attempt).entered) return null;
  const etaBefore = bossEtaSec(attempt, 0);
  const investSec = Number.isFinite(etaBefore) ? etaBefore / 3 : 2 * SEC_PER_HOUR;
  let left = investSec;
  while (left > 1e-9 && attempt.phase === 'boss') {
    const dt = Math.min(IDLE_SLICE_SEC, left);
    advance(attempt, dt);
    left -= dt;
  }
  if (attempt.phase !== 'boss') return null; // it died; nothing was abandoned
  const lostFraction = 1 - attempt.boss.hpRemaining / attempt.boss.hpMax;
  abandonBoss(attempt);

  const farming = clone(portalReadyState);
  const goldBefore = farming.lifetime.goldEarned;
  left = investSec;
  while (left > 1e-9) {
    const dt = Math.min(IDLE_SLICE_SEC, left);
    advance(farming, dt);
    left -= dt;
    botTouch(farming);
  }
  const farmed = clone(farming);
  enterPortal(farmed);

  return {
    investedSec: investSec,
    lostBossSec: lostFraction * investSec,
    roadGoldGained: farming.lifetime.goldEarned - goldBefore,
    etaImprovement: etaBefore - bossEtaSec(farmed, 0),
  };
}

/**
 * Gold resets to zero on ascension, so the first seconds of a realm have
 * nothing affordable through no fault of the upgrade list. The grace window
 * excludes exactly that, and is stated here rather than hidden in a threshold.
 */
export const SPEND_GRACE_SEC = 60;
/** Below this many affordable rows the player has no real choice to make. */
const STARVED_BELOW = 2;
/** The affordable-row count the panel should offer at a typical look. */
export const SPEND_TARGET = 4;
/** Priced rows the panel must carry at *every* look, gold irrelevant. */
export const SPEND_PRICED_FLOOR = 5;
/**
 * Ceilings for the starvation clauses, set from first measurement rather than
 * guessed: across a 30-day run the player is under two affordable rows for
 * 0.12% of looks, p50 60s and p99 150s, and every long one sits at the same
 * point — the deliberate spend-down just before committing to a guardian.
 * Emptying your own wallet on purpose is not an empty shop, so the bar is set
 * to pass that and still fail loudly on a real stall, which in the capped-tree
 * game ran to hours rather than minutes.
 */
export const SPEND_MAX_STARVED_FRACTION = 0.01;
export const SPEND_MAX_DROUGHT_SEC = 300;

/**
 * Ceilings on time parked on an open portal. 24h is one full idle day spent
 * earning no Ascendancy at all — past that the realm has stopped being a realm
 * and become a waiting room. The capped-tree game ran to 76h, so this bites
 * exactly where P6 was blind.
 */
export const MAX_PORTAL_WAIT_SEC = 24 * SEC_PER_HOUR;
/** Waiting may not become the majority of a realm's Road time. */
export const MAX_PORTAL_WAIT_FRACTION = 0.5;
/**
 * Realm cadence floor. Realms run about a day each once the player is going;
 * 3 days is the point where "one realm per session or two" has visibly broken,
 * and the capped-tree game reached 3.5.
 */
export const MAX_REALM_DAYS = 3;

/**
 * The band that replaces the 1.8–2.2x gold band, in the currency that survives
 * an ascension. A gold multiplier can never beat a night of idle, because idle
 * has all night; Ascendancy per realm is bounded, so the comparison separates
 * the two players instead of the two clocks. The ceiling is as load-bearing as
 * the floor: idle-only play has to stay meaningfully productive (VISION pillar
 * 4), and a 3x active player makes it decorative.
 *
 * Six seeds at the 14-day horizon: 1.87 / 1.53 / 1.96 / 1.78 / 1.78 / 2.11,
 * mean 1.84. The spread is real — gear rarity rolls compound over dozens of
 * realms — so the band is set around the measured range, not the mean.
 */
export const PERMANENT_RATIO_MIN = 1.4;
export const PERMANENT_RATIO_MAX = 2.3;

/**
 * How much sooner active play reaches its first ascension — the first time
 * permanent power exists at all, and the moment onboarding either lands or
 * does not. Six seeds: 1.22 / 1.27 / 1.22 / 1.31 / 1.29 / 1.27, so ~11.9 h
 * against ~14.5 h.
 */
export const PERMANENT_SOONER_MIN = 1.2;

export const PERMANENT_RANK_TARGET = 20;

/**
 * The horizon the Ascendancy band is stated at, and it has to be stated: the
 * ratio decays with run length because both players climb — and finish — the
 * same realm ladder. Measured 1.84 at 14 days, 1.91 at 30 and 1.17 at 90,
 * where 302 of the 301 winnable realms are behind both of them.
 *
 * It is a **fixed checkpoint**, not the run length, so every run reports the
 * same comparable number. Fourteen days is the default run, so `npm run sim`
 * evaluates the band it prints rather than judging a 14-day measurement
 * against a 30-day bar (docs/DECISIONS.md #39).
 */
export const PERMANENT_HORIZON_SEC = 14 * SEC_PER_DAY;

/**
 * Checkpoints the active/idle multiple is reported at. Reported, never banded:
 * only `PERMANENT_HORIZON_SEC` carries a band (#39), and a curve that can go red
 * becomes a thing to tune.
 */
export const HORIZON_SWEEP_DAYS = [3, 7, 14, 21, 30, 45, 60, 75, 90];

/** Summarise every look at the upgrade panel taken past the grace window. */
export function spendDepth(samples: ShopSample[]): SpendDepth {
  const counted = samples.filter((x) => x.sinceRealmStartSec >= SPEND_GRACE_SEC);
  if (counted.length === 0) {
    return {
      counted: 0,
      minAffordable: 0,
      minPriced: 0,
      worstRealm: -1,
      richFraction: 0,
      starvedFraction: 1,
      longestStarvedSec: Infinity,
    };
  }

  let minAffordable = Infinity;
  let minPriced = Infinity;
  let worstRealm = counted[0]!.realm;
  let starved = 0;
  let rich = 0;
  let longestStarvedSec = 0;
  let runStartSec: number | null = null;
  let prevSec: number | null = null;

  for (const x of counted) {
    if (x.affordable < minAffordable) {
      minAffordable = x.affordable;
      worstRealm = x.realm;
    }
    if (x.priced < minPriced) minPriced = x.priced;
    if (x.affordable >= SPEND_TARGET) rich += 1;

    // Bracket the drought rather than measure sample-to-sample: it began some
    // time after the last healthy look and ended some time before the next, so
    // the honest figure is the whole window it sits inside. Measuring first-to-
    // last starved sample reads 0s for a drought seen once and understates
    // every other by up to one sampling interval — the wrong direction for a
    // number a validator leans on.
    if (x.affordable < STARVED_BELOW) {
      starved += 1;
      if (runStartSec === null) runStartSec = prevSec ?? x.timeSec;
      const span = x.timeSec - runStartSec;
      if (span > longestStarvedSec) longestStarvedSec = span;
    } else {
      if (runStartSec !== null) {
        const span = x.timeSec - runStartSec;
        if (span > longestStarvedSec) longestStarvedSec = span;
      }
      runStartSec = null;
    }
    prevSec = x.timeSec;
  }

  return {
    counted: counted.length,
    minAffordable,
    minPriced,
    worstRealm,
    richFraction: rich / counted.length,
    starvedFraction: starved / counted.length,
    longestStarvedSec,
  };
}

/**
 * Time parked on a realm whose portal is open. It earns no Ascendancy at all
 * (docs/DECISIONS.md #22), so it is the purest dead time the game can produce —
 * and P6 cannot see it, because the entry gate spends it *before* the fight
 * starts and P6 only measures the fight.
 */
export function deadTime(realms: RealmRecord[]): DeadTime {
  let longestSec = 0;
  let worstRealm = -1;
  let waited = 0;
  let road = 0;
  let slowestRealmDays = 0;
  let slowestRealm = -1;
  let counted = 0;

  for (const r of realms) {
    if (r.portalReadySec === null || r.portalEnterSec === null) continue;
    counted += 1;
    const wait = r.portalEnterSec - r.portalReadySec;
    waited += wait;
    road += r.roadSec ?? wait;
    if (wait > longestSec) {
      longestSec = wait;
      worstRealm = r.realm;
    }
    if (r.victorySec !== null) {
      const days = (r.victorySec - r.startSec) / SEC_PER_DAY;
      if (days > slowestRealmDays) {
        slowestRealmDays = days;
        slowestRealm = r.realm;
      }
    }
  }

  return {
    longestSec,
    worstRealm,
    fraction: road > 0 ? waited / road : 0,
    slowestRealmDays,
    slowestRealm,
    realms: counted,
  };
}

/**
 * A 20-minute session is 2.8% of a 12-hour cycle, so a beat that lands anywhere
 * in wall-clock time is one the player almost never sees. This reports which
 * milestones actually happen while someone is watching. Reported, never banded:
 * the arc it argues for is not approved, and a metric that can go red becomes a
 * thing to tune (#47).
 */
export function witnessedBeats(config: SimConfig, realms: RealmRecord[]): WitnessedBeats | null {
  const sessionSec = config.sessionMin * 60;
  const cycleSec = SEC_PER_DAY / config.sessionsPerDay;
  if (sessionSec <= 0 || cycleSec <= sessionSec) return null;

  const seen = (t: number): boolean => t % cycleSec < sessionSec;
  const tally = (pick: (r: RealmRecord) => number | null): { inSession: number; total: number } => {
    let inSession = 0;
    let total = 0;
    for (const r of realms) {
      const t = pick(r);
      if (t === null) continue;
      total += 1;
      if (seen(t)) inSession += 1;
    }
    return { inSession, total };
  };

  return {
    baseline: sessionSec / cycleSec,
    beats: [
      { name: 'portal opens', ...tally((r) => r.portalReadySec) },
      { name: 'portal entered', ...tally((r) => r.portalEnterSec) },
      { name: 'guardian felled', ...tally((r) => r.victorySec) },
    ],
  };
}

/** First sample at which the tree has reached `target` total ranks. */
function secToRanks(samples: { timeSec: number; treeRanks: number }[], target: number): number | null {
  for (const x of samples) if (x.treeRanks >= target) return x.timeSec;
  return null;
}

/**
 * What active play buys in the *permanent* currency. Gold cannot answer this:
 * no rate multiplier on a temporary resource beats a night of idle, because
 * idle has all night. Ascendancy per realm is bounded, so this is the question
 * that actually distinguishes the two players.
 */
export function permanentUplift(
  seed: number,
  config: SimConfig,
  active: {
    state: GameState;
    realms: RealmRecord[];
    rankTrail: { timeSec: number; treeRanks: number }[];
    earnedTrail: { timeSec: number; earned: number }[];
    frontierRealm: number | null;
    frontierSec: number | null;
  },
): PermanentUplift | null {
  // The active side is the headline run, already computed; only the idle
  // counterpart has to be simulated here.
  const idle = runPlayer(seed, config, { policy: 'road-idle', entry: 'prompt' });
  if (idle.state.timeSec <= 0) return null;

  const firstWin = (r: RealmRecord[]): number | null =>
    r.find((x) => x.victorySec !== null)?.victorySec ?? null;

  const earnedAt = (
    trail: { timeSec: number; earned: number }[],
    final: GameState,
    horizon: number,
  ): number => {
    let out = 0;
    for (const x of trail) if (x.timeSec <= horizon) out = x.earned;
    return trail.length === 0 || final.timeSec <= horizon ? totalEarned(final) : out;
  };
  // A run that meets the frontier stops there, so `shortest` already caps the
  // reading at content end. Naming it keeps a bare ratio from reading as a
  // pacing verdict when it is really a run that ran out of ladder.
  const ends = [
    { realm: idle.frontierRealm, sec: idle.frontierSec },
    { realm: active.frontierRealm, sec: active.frontierSec },
  ].filter((e): e is { realm: number; sec: number } => e.realm !== null && e.sec !== null);
  const firstEnd = ends.sort((a, b) => a.sec - b.sec)[0];

  const shortest = Math.min(idle.state.timeSec, active.state.timeSec);
  const reachedHorizon = shortest >= PERMANENT_HORIZON_SEC;
  const measuredAtSec = Math.min(PERMANENT_HORIZON_SEC, shortest);
  const idleEarned = earnedAt(idle.earnedTrail, idle.state, measuredAtSec);
  const activeEarned = earnedAt(active.earnedTrail, active.state, measuredAtSec);

  // `earnedAt` carries the last trail value forward, so a checkpoint past either
  // run's end divides a frozen total by a growing one — a hyperbola that reads
  // like a pacing collapse. Past `shortest` the sweep reports no data instead.
  const sweep: HorizonPoint[] = [];
  for (const day of HORIZON_SWEEP_DAYS) {
    const sec = day * SEC_PER_DAY;
    if (sec > config.days * SEC_PER_DAY) continue;
    if (sec > shortest) {
      const past = firstEnd !== undefined && sec > firstEnd.sec;
      sweep.push({ sec, ratio: null, blocked: past ? 'content-end' : 'run-length' });
      continue;
    }
    const i = earnedAt(idle.earnedTrail, idle.state, sec);
    const a = earnedAt(active.earnedTrail, active.state, sec);
    sweep.push({ sec, ratio: i > 0 ? a / i : null, blocked: i > 0 ? null : 'run-length' });
  }
  return {
    horizonSec: PERMANENT_HORIZON_SEC,
    reachedHorizon,
    measuredAtSec,
    idleEarned,
    activeEarned,
    ratio: idleEarned > 0 ? activeEarned / idleEarned : Infinity,
    idleFirstAscensionSec: firstWin(idle.realms),
    activeFirstAscensionSec: firstWin(active.realms),
    sweep,
    contentEndRealm: firstEnd?.realm ?? null,
    contentEndSec: firstEnd?.sec ?? null,
    rankTarget: PERMANENT_RANK_TARGET,
    idleRankSec: secToRanks(idle.rankTrail, PERMANENT_RANK_TARGET),
    activeRankSec: secToRanks(active.rankTrail, PERMANENT_RANK_TARGET),
  };
}
