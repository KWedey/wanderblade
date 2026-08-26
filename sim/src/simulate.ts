// The multi-realm driver: runs one seeded player through a day-structured
// schedule, records every realm lifecycle, and watches the phase contract live.

import {
  advance,
  affordableCount,
  attackSpeedMultiplier,
  bossEtaSec,
  bossHp,
  deserialize,
  earningsMultiplier,
  enterPortal,
  gearPowerTotal,
  heroDps,
  initialState,
  killTime,
  momentumAt,
  pricedCount,
  serialize,
  swingInterval,
  type GameEvent,
  type GameState,
} from '@wanderblade/core';
import { botTouch } from './bot';
import { CAP_RATE, runActive, runIdle, SEC_PER_DAY, strikeTimes, type RunHooks } from './policy';
import type {
  BreachKind,
  PolicyName,
  RealmRecord,
  Sample,
  ShopSample,
  SimConfig,
} from './types';

/** How often a Road clone is kept as a probe fixture. */
const ROAD_STATE_INTERVAL_SEC = 3600;

/**
 * A "prepared build" in the pacing band's sense: the client previews the
 * guardian's estimated duration before entry, so the modelled player farms on
 * rather than committing to a fight the preview says will take all week.
 */
const PREPARED_MAX_ETA_SEC = 90 * 60;
/** Even an unpromising realm gets committed to eventually. */
const PREPARE_PATIENCE_SEC = 3 * SEC_PER_DAY;

/** The duration the portal preview would show, at sustained full momentum. */
export function previewEtaSec(state: GameState): number {
  const dps = heroDps(state) * attackSpeedMultiplier(state, 1);
  if (!(dps > 0)) return Infinity;
  return bossHp(state.realm) / dps;
}

/** Portal-entry timing. `prompt` commits at the first chance after it opens. */
export type EntryStrategy = 'prompt' | 'overfarm-2x';

export interface RunOptions {
  policy: PolicyName;
  entry: EntryStrategy;
  /** Stop once this many victories have landed. */
  maxVictories?: number;
  /** Stop the moment the current realm's portal opens. */
  stopAtPortalReady?: boolean;
  /** Play without pause — the "hours of active play" the pacing band means. */
  continuous?: boolean;
  sampleEverySec?: number;
}

export interface RunResult {
  state: GameState;
  realms: RealmRecord[];
  samples: Sample[];
  /** Every kind of breach seen live — never truncated. Empty is the passing case. */
  breaches: BreachKind[];
  /** Readable detail for the breaches above, capped at 20 lines. */
  violations: string[];
  totalActiveSec: number;
  /** Realm index → a clone taken the instant that realm's portal was entered. */
  snapshots: Map<number, GameState>;
  /** Periodic Road clones, the fixtures the windowed probes replay from. */
  roadStates: GameState[];
  /**
   * Every look at the upgrade panel, taken before any purchase loop ran. The
   * whole run, uncapped: a truncated tail would let the late realms P8 is
   * really about go unmeasured while the report still printed a large `n`.
   */
  shopSamples: ShopSample[];
}

export function clone(s: GameState): GameState {
  return deserialize(serialize(s));
}

function blankRealm(realm: number, startSec: number): RealmRecord {
  return {
    realm,
    startSec,
    portalReadySec: null,
    portalEnterSec: null,
    victorySec: null,
    roadSec: null,
    bossSec: 0,
    activeSec: 0,
    bossEtaAtEntrySec: null,
    bossActiveEtaAtEntrySec: null,
    gearPowerAtEntry: 0,
    dpsAtEntry: 0,
    goldPeak: 0,
    pendingAtVictory: null,
    bankedAfter: null,
    earningsMultAfter: null,
    treePurchasesTotal: 0,
  };
}

function sampleOf(s: GameState): Sample {
  return {
    timeSec: s.timeSec,
    phase: s.phase,
    realm: s.realm,
    zone: s.zone,
    gold: s.gold,
    gearPower: gearPowerTotal(s.gear),
    dps: heroDps(s),
    heroLevel: s.hero.level,
    pending: s.ascendancy.pending,
    banked: s.ascendancy.banked,
    bossHpFrac: s.boss.hpMax > 0 ? s.boss.hpRemaining / s.boss.hpMax : 0,
    earningsMult: earningsMultiplier(s.ascendancy.victories),
  };
}

/**
 * The scalars the watch compares between slices. Active play calls `check`
 * once per strike, so this is a hot path — a full `clone` there is a JSON
 * round-trip of the whole state, arcs included, for nine numbers.
 */
interface Watched {
  phase: string;
  gold: number;
  pending: number;
  leagues: number;
  zone: number;
  kills: number;
  gearFound: number;
  zonesCleared: number;
  killIndex: number;
  rngState: number;
  bossHpRemaining: number;
}

function watched(s: GameState): Watched {
  return {
    phase: s.phase,
    gold: s.gold,
    pending: s.ascendancy.pending,
    leagues: s.leagues,
    zone: s.zone,
    kills: s.lifetime.kills,
    gearFound: s.collection.gearFound,
    zonesCleared: s.collection.zonesCleared,
    killIndex: s.killIndex,
    rngState: s.rngState,
    bossHpRemaining: s.boss.hpRemaining,
  };
}

/**
 * Watches the live run for anything the phase contract forbids. This is the
 * correctness evidence, gathered from the real run rather than asserted after.
 */
class ContractWatch {
  /**
   * Every kind of breach seen. Uncapped on purpose: the message list below is
   * capped for readability, and a validator that read only that list would call
   * its own breach clean once 20 messages of some other kind had filled it.
   */
  readonly breaches = new Set<BreachKind>();
  readonly violations: string[] = [];
  private prev: Watched;

  constructor(state: GameState) {
    this.prev = watched(state);
  }

  private note(kind: BreachKind, msg: string): void {
    this.breaches.add(kind);
    if (this.violations.length < 20) this.violations.push(msg);
  }

  check(state: GameState, events: GameEvent[]): void {
    const t = state.timeSec.toFixed(1);
    const wasBoss = this.prev.phase === 'boss';

    if (!wasBoss && state.phase === 'boss' && !events.some((e) => e.type === 'portalEnter')) {
      this.note('auto-entry', `t=${t}: entered the boss phase with no explicit action`);
    }
    if (wasBoss && state.phase === 'boss') {
      const now = watched(state);
      const frozen: Array<[string, number]> = [
        ['gold', now.gold - this.prev.gold],
        ['pendingAscendancy', now.pending - this.prev.pending],
        ['leagues', now.leagues - this.prev.leagues],
        ['zone', now.zone - this.prev.zone],
        ['kills', now.kills - this.prev.kills],
        ['gearFound', now.gearFound - this.prev.gearFound],
        ['zonesCleared', now.zonesCleared - this.prev.zonesCleared],
        ['killIndex', now.killIndex - this.prev.killIndex],
        ['rngState', now.rngState - this.prev.rngState],
      ];
      for (const [name, delta] of frozen) {
        if (delta !== 0) {
          this.note('boss-income', `t=${t}: ${name} moved during boss elapsed time`);
        }
      }
      if (now.bossHpRemaining > this.prev.bossHpRemaining) {
        this.note('hp-regen', `t=${t}: guardian HP regenerated`);
      }
    }
    // HP, DPS, currency, duration, and multiplier — the five classes
    // docs/ECONOMY.md "Determinism and numerical safety" names.
    const momentum = momentumAt(state.momentum, state.timeSec);
    const finite = [
      state.boss.hpRemaining,
      heroDps(state),
      state.gold,
      state.ascendancy.banked,
      state.ascendancy.pending,
      state.phase === 'boss' ? swingInterval(state, momentum) : killTime(state, momentum),
      earningsMultiplier(state.ascendancy.victories),
      attackSpeedMultiplier(state, momentum),
    ];
    if (finite.some((v) => !Number.isFinite(v))) {
      this.note('non-finite', `t=${t}: a non-finite value reached client state`);
    }
    this.prev = watched(state);
  }
}

/** Run one seeded player for `days`, or until an early-stop condition fires. */
export function runPlayer(seed: number, config: SimConfig, opts: RunOptions): RunResult {
  const state = initialState(seed);
  const realms: RealmRecord[] = [blankRealm(0, 0)];
  const samples: Sample[] = [];
  const watch = new ContractWatch(state);
  const active = opts.policy === 'road-active';
  const sessionSec = opts.continuous ? SEC_PER_DAY : config.sessionMin * 60;
  const gapSec = opts.continuous
    ? 0
    : Math.max(0, SEC_PER_DAY / config.sessionsPerDay - sessionSec);
  const sampleEvery = opts.sampleEverySec ?? 900;

  const snapshots = new Map<number, GameState>();
  const roadStates: GameState[] = [];
  const shopSamples: ShopSample[] = [];
  let totalActiveSec = 0;
  let stop = false;
  let overfarmUntilSec: number | null = null;
  let nextSampleAt = 0;
  let nextRoadStateAt = 0;

  const current = (): RealmRecord => realms[realms.length - 1] as RealmRecord;

  const hooks: RunHooks = {
    onEvents: (events) => {
      watch.check(state, events);
      for (const e of events) {
        if (e.type === 'portalReady') {
          const r = current();
          if (r.portalReadySec === null) r.portalReadySec = e.timeSec;
          if (opts.entry === 'overfarm-2x') {
            overfarmUntilSec = e.timeSec + (e.timeSec - r.startSec);
          }
          if (opts.stopAtPortalReady) stop = true;
        } else if (e.type === 'bossVictory') {
          current().pendingAtVictory = e.pendingBanked;
        } else if (e.type === 'ascend') {
          const r = current();
          r.victorySec = e.timeSec;
          r.bankedAfter = e.banked;
          r.earningsMultAfter = earningsMultiplier(e.victories);
          if (r.portalEnterSec !== null) r.bossSec += e.timeSec - r.portalEnterSec;
          realms.push(blankRealm(e.toRealm, e.timeSec));
          overfarmUntilSec = null;
          if (opts.maxVictories !== undefined && e.victories >= opts.maxVictories) stop = true;
        }
      }
    },
    onShop: (s) => {
      if (s.phase !== 'road') return;
      shopSamples.push({
        timeSec: s.timeSec,
        sinceRealmStartSec: s.timeSec - current().startSec,
        realm: s.realm,
        affordable: affordableCount(s),
        priced: pricedCount(s),
      });
    },
    onPurchases: (bought) => {
      current().treePurchasesTotal += bought.tree;
    },
    onSlice: () => {
      const r = current();
      if (state.gold > r.goldPeak) r.goldPeak = state.gold;
      if (state.timeSec >= nextSampleAt && samples.length < 5000) {
        samples.push(sampleOf(state));
        nextSampleAt = state.timeSec + sampleEvery;
      }
      if (
        state.phase === 'road' &&
        state.timeSec >= nextRoadStateAt &&
        roadStates.length < 200
      ) {
        roadStates.push(clone(state));
        nextRoadStateAt = state.timeSec + ROAD_STATE_INTERVAL_SEC;
      }
    },
  };

  /** Commit to the portal if the strategy says the moment has come. */
  const maybeEnter = (): void => {
    if (stop || state.phase !== 'road' || !state.portalReady) return;
    if (
      opts.entry === 'overfarm-2x' &&
      overfarmUntilSec !== null &&
      state.timeSec < overfarmUntilSec
    ) {
      return;
    }
    current().treePurchasesTotal += botTouch(state).tree;
    const r = current();
    if (
      r.portalReadySec !== null &&
      state.timeSec - r.portalReadySec < PREPARE_PATIENCE_SEC &&
      previewEtaSec(state) > PREPARED_MAX_ETA_SEC
    ) {
      return; // the preview says this fight is not worth committing to yet
    }
    const res = enterPortal(state);
    if (!res.entered) return;
    r.portalEnterSec = state.timeSec;
    r.roadSec = state.timeSec - r.startSec;
    r.gearPowerAtEntry = gearPowerTotal(state.gear);
    r.dpsAtEntry = heroDps(state);
    r.bossEtaAtEntrySec = bossEtaSec(state, 0);
    r.bossActiveEtaAtEntrySec = bossEtaSec(state, 1);
    snapshots.set(r.realm, clone(state));
    hooks.onEvents?.(res.events);
  };

  const horizon = config.days * SEC_PER_DAY;
  while (state.timeSec < horizon && !stop) {
    maybeEnter();

    const session = Math.min(sessionSec, horizon - state.timeSec);
    if (session > 0) {
      const realmAtStart = current();
      if (active) {
        runActive(state, session, CAP_RATE, hooks);
        totalActiveSec += session;
        realmAtStart.activeSec += session;
      } else {
        runIdle(state, session, hooks);
        realmAtStart.treePurchasesTotal += botTouch(state).tree;
      }
    }

    maybeEnter();
    const gap = Math.min(gapSec, horizon - state.timeSec);
    if (gap > 0) {
      runIdle(state, gap, hooks);
      current().treePurchasesTotal += botTouch(state).tree;
    }
  }

  // Attribute any unfinished attempt's elapsed time to the realm it belongs to.
  const last = current();
  if (state.phase === 'boss' && last.portalEnterSec !== null && last.victorySec === null) {
    last.bossSec += state.timeSec - last.portalEnterSec;
  }

  return {
    state,
    realms,
    samples,
    breaches: [...watch.breaches],
    violations: watch.violations,
    totalActiveSec,
    snapshots,
    roadStates,
    shopSamples,
  };
}

/**
 * Elapsed seconds for a cloned state to fell its guardian at `rate` strikes/s,
 * or null if it is still standing after `capSec`.
 */
export function timeToKill(start: GameState, rate: number, capSec: number): number | null {
  const s = clone(start);
  const t0 = s.timeSec;
  let victoryAt: number | null = null;
  let left = capSec;
  while (left > 1e-9 && victoryAt === null) {
    const dt = Math.min(300, left);
    const from = s.timeSec;
    const events = advance(s, dt, rate > 0 ? strikeTimes(from, dt, rate) : []);
    for (const e of events) if (e.type === 'bossVictory') victoryAt = e.timeSec;
    left -= dt;
  }
  return victoryAt === null ? null : victoryAt - t0;
}
