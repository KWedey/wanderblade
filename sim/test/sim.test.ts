import { describe, expect, it } from 'vitest';
import {
  advance,
  arcPositionAt,
  ARC_FLIGHT_SEC,
  initialState,
  SKILL_IDS,
  zonesPerRealm,
  type GameState,
  type LootArc,
} from '@wanderblade/core';
import { DEFAULTS, parseArgs } from '../src/args';
import { formatSeedReport, formatSummary, REALM_CSV_COLUMNS, realmsCsv } from '../src/format';
import { botBuyGold, botBuyTree, botTouch } from '../src/bot';
import { aimAtOldestArc, CAP_RATE, runIdle, strikeThrough, strikeTimes } from '../src/policy';
import {
  deadTime,
  spendDepth,
  SPEND_GRACE_SEC,
  SPEND_TARGET,
  permanentUplift,
  twentyFourHourReturn,
  witnessedBeats,
} from '../src/probes';
import { runPlayer } from '../src/simulate';
import { runCorrectness, runPacing } from '../src/validators';
import { PERMANENT_HORIZON_SEC } from '../src/probes';
import type {
  BreachKind,
  HorizonPoint,
  RealmRecord,
  SeedResult,
  ShopSample,
  SimConfig,
  ValidatorResult,
} from '../src/types';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  ...DEFAULTS,
  days: 1,
  seeds: 1,
  ...over,
});

describe('parseArgs', () => {
  it('applies documented defaults with no flags', () => {
    expect(parseArgs([])).toEqual({
      days: 14,
      seed: 1,
      seeds: 3,
      sessionMin: 20,
      sessionsPerDay: 2,
      csv: false,
      quick: false,
    });
  });

  it('parses space- and equals-separated flags plus the --csv boolean', () => {
    expect(
      parseArgs(['--days', '5', '--seed=7', '--seeds', '2', '--session-min=30', '--csv']),
    ).toEqual({
      days: 5,
      seed: 7,
      seeds: 2,
      sessionMin: 30,
      sessionsPerDay: 2,
      csv: true,
      quick: false,
    });
  });

  it('returns help and rejects bad input', () => {
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--nope'])).toThrow();
    expect(() => parseArgs(['--days', '0'])).toThrow();
    expect(() => parseArgs(['--seed', 'x'])).toThrow();
    expect(() => parseArgs(['--session-min', '800'])).toThrow();
  });
});

describe('bot termination guards', () => {
  it('makes zero purchases and terminates when gold has overflowed to Infinity', () => {
    const state: GameState = initialState(1);
    state.gold = Infinity;
    expect(botBuyGold(state)).toBe(0);
  });

  it('spends a finite balance down and then stops', () => {
    const state: GameState = initialState(1);
    state.gold = 1000;
    expect(botBuyGold(state)).toBeGreaterThan(0);
    expect(Number.isFinite(state.gold)).toBe(true);
    expect(state.gold).toBeLessThan(1000);
  });

  it('terminates on skills whose marginal value has decayed to nothing', () => {
    const state: GameState = initialState(1);
    state.hero.level = 20;
    for (const id of SKILL_IDS) state.hero.skills[id] = 4_000;
    state.gold = 1e6;
    expect(botBuyGold(state)).toBeGreaterThan(0);
    expect(state.gold).toBeLessThan(1e6);
  });

  it('spends banked Ascendancy down to nothing affordable', () => {
    const state: GameState = initialState(1);
    state.ascendancy.banked = 200;
    expect(botBuyTree(state)).toBeGreaterThan(0);
    expect(state.ascendancy.banked).toBeLessThan(200);
    expect(botBuyTree(state)).toBe(0);
  });

  it('buys nothing from the tree during a boss attempt', () => {
    const state: GameState = initialState(1);
    state.phase = 'boss';
    state.ascendancy.banked = 1e6;
    expect(botBuyTree(state)).toBe(0);
    expect(botBuyGold(state)).toBe(0);
  });
});

describe('strikeTimes', () => {
  it('emits evenly spaced timestamps strictly inside the window', () => {
    expect(strikeTimes(10, 1, 4).map((s) => s.atSec)).toEqual([10.25, 10.5, 10.75, 11]);
    expect(strikeTimes(0, 0, 4)).toEqual([]);
    expect(strikeTimes(0, 10, 0)).toEqual([]);
  });

  it('carries the aim it was given, and no aim by default', () => {
    expect(strikeTimes(0, 1, 4).every((s) => s.aim === null)).toBe(true);
    const aimed = strikeTimes(0, 1, 4, { x: 0.5, y: 1 });
    expect(aimed.every((s) => s.aim?.x === 0.5 && s.aim.y === 1)).toBe(true);
  });

  it('uses the momentum-sustaining rate as the reference cadence', () => {
    expect(CAP_RATE).toBeGreaterThan(3);
    expect(CAP_RATE).toBeLessThan(4);
  });
});

// `f?.(advance(...))` never calls advance when f is undefined, so a driver loop
// that folds the advance into the optional report spins forever on the callers
// that pass no callback — every P1 probe arm among them.
describe('the driver loops advance whether or not anyone is listening', () => {
  it('runIdle moves the clock with no hooks at all', () => {
    const s = initialState(11);
    runIdle(s, 600);
    expect(s.timeSec).toBe(600);
    expect(s.killIndex).toBeGreaterThan(0);
  });

  it('strikeThrough moves the clock with no onEvents, striking and idle alike', () => {
    const striking = initialState(11);
    strikeThrough(striking, 600, CAP_RATE);
    expect(striking.timeSec).toBeGreaterThanOrEqual(600 - 1e-9);
    expect(striking.killIndex).toBeGreaterThan(0);

    const idle = initialState(11);
    strikeThrough(idle, 600, 0);
    expect(idle.timeSec).toBeGreaterThanOrEqual(600 - 1e-9);
    expect(idle.killIndex).toBeGreaterThan(0);
  });

  it('reports the same events it would have advanced silently', () => {
    const quiet = initialState(12);
    strikeThrough(quiet, 300, CAP_RATE);

    const loud = initialState(12);
    let seen = 0;
    strikeThrough(loud, 300, CAP_RATE, (e) => {
      seen += e.length;
    });
    expect(seen).toBeGreaterThan(0);
    expect(loud.gold).toBe(quiet.gold);
  });
});

describe('aimAtOldestArc', () => {
  it('aims at the oldest arc still in flight, and nowhere when all have landed', () => {
    const s = initialState(31);
    advance(s, 4.001);
    expect(s.arcs.length).toBeGreaterThanOrEqual(2);

    // The head of the list can already have landed: arcs are pruned at the next
    // kill, not continuously, and one kill's coins are staggered. The oldest
    // *still in flight* is the first with a live position.
    const oldestLive = s.arcs.find((a) => arcPositionAt(a, 4.05) !== null);
    expect(oldestLive).toBeDefined();
    expect(aimAtOldestArc(s, 4.05)).toEqual(arcPositionAt(oldestLive as LootArc, 4.05));

    // Long past every arc's flight time, there is nothing left to aim at.
    expect(aimAtOldestArc(s, 4.05 + ARC_FLIGHT_SEC * 2)).toBeNull();
  });

  it('turns strikes into catches that blind striking never gets', () => {
    const blind = initialState(37);
    advance(blind, 600, strikeTimes(0, 600, CAP_RATE));

    const aimed = initialState(37);
    strikeThrough(aimed, 600, CAP_RATE);

    expect(aimed.gold).toBeGreaterThan(blind.gold);
  });
});

/** How far down the whole run a state has come, across realm resets. */
function progress(s: GameState): number {
  return s.realm * zonesPerRealm + s.zone;
}

describe('runPlayer determinism and contract watching', () => {
  it('produces identical runs for the same seed and policy', () => {
    const a = runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' });
    const b = runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' });
    expect(a.state.timeSec).toBe(b.state.timeSec);
    expect(a.state.gold).toBe(b.state.gold);
    expect(a.state.killIndex).toBe(b.state.killIndex);
    expect(a.realms.map((r) => r.portalReadySec)).toEqual(b.realms.map((r) => r.portalReadySec));
  });

  it('reports no phase-contract violations on a clean run', () => {
    const r = runPlayer(2, cfg({ days: 2 }), { policy: 'road-active', entry: 'prompt' });
    expect(r.violations).toEqual([]);
  });

  it('the active policy strikes and the idle policy never does', () => {
    const active = runPlayer(3, cfg(), { policy: 'road-active', entry: 'prompt' });
    const idle = runPlayer(3, cfg(), { policy: 'road-idle', entry: 'prompt' });
    expect(active.totalActiveSec).toBeGreaterThan(0);
    expect(idle.totalActiveSec).toBe(0);
    expect(idle.state.momentum.value).toBe(0);
    // Progress, not kill count: the active player ascends sooner and so spends
    // the same hours on fewer, larger enemies. Raw kills favour whoever stayed
    // behind in the cheap zones.
    expect(progress(active.state)).toBeGreaterThan(progress(idle.state));
    expect(active.state.ascendancy.victories).toBeGreaterThanOrEqual(
      idle.state.ascendancy.victories,
    );
  });

  it('stops at portal-ready when asked', () => {
    const r = runPlayer(4, cfg({ days: 30 }), {
      policy: 'road-active',
      entry: 'prompt',
      stopAtPortalReady: true,
    });
    expect(r.state.portalReady).toBe(true);
    expect(r.state.phase).toBe('road');
  });
});

/** One real run, reused by every stub — building it is the expensive part. */
let cachedRun: ReturnType<typeof runPlayer> | null = null;

/**
 * A full-length run blocks the worker thread while it computes, and a worker
 * that cannot answer the reporter's heartbeat fails the suite without failing a
 * test. One week-long run is shared by every probe that needs real realms.
 */
const WEEK = { days: 7 } as const;
let cachedWeek: ReturnType<typeof runPlayer> | null = null;
const weekRun = (): ReturnType<typeof runPlayer> =>
  (cachedWeek ??= runPlayer(1, cfg(WEEK), { policy: 'road-active', entry: 'prompt' }));

const PASSED = { pass: true, detail: '' };

function stubResult(over: Partial<SeedResult> = {}): SeedResult {
  const main = (cachedRun ??= runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' }));
  return {
    seed: 1,
    config: cfg(),
    realms: main.realms,
    samples: main.samples,
    correctness: [],
    pacing: [],
    roadUplift: [],
    roadWindowUplift: [],
    bossUplift: [],
    eightHourBuys: [],
    twentyFourHourZones: [],
    portalReachSec: { idle: null, active: null },
    promptVsOverfarm: null,
    abandonProbe: null,
    frontierRealm: main.frontierRealm,
    frontierSec: main.frontierSec,
    witnessed: null,
    spendDepth: spendDepth(main.shopSamples),
    deadTime: deadTime(main.realms),
    permanentUplift: null,
    totalKills: main.state.killIndex,
    finalRealm: main.state.realm,
    victories: 0,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: PASSED,
    replayIdentical: PASSED,
    abandonClean: PASSED,
    remainingTimeCarried: PASSED,
    earningsBonusIsolated: PASSED,
    ...over,
  };
}

// `--quick` never runs the long probes; a validator nothing measured is SKIP, not FAIL.
describe('--quick marks unmeasured validators skipped, never failed', () => {
  const quick = (): SeedResult =>
    stubResult({
      config: cfg({ quick: true }),
      offlineMatchesLive: null,
      replayIdentical: null,
      abandonClean: null,
      remainingTimeCarried: null,
      earningsBonusIsolated: null,
    });
  const SKIPPED = ['C3', 'C4', 'C5', 'C7', 'C8', 'P3', 'P4', 'P7', 'P10'];

  it('skips exactly the validators --quick cannot measure', () => {
    const r = quick();
    const all = [...runCorrectness(r), ...runPacing(r)];
    expect(all.filter((v) => v.skipped).map((v) => v.id)).toEqual(SKIPPED);
    for (const v of all.filter((v) => v.skipped)) expect(v.pass).toBe(false);
  });

  it('fails, not skips, an experiment a full run left unmeasured', () => {
    const r = stubResult({ offlineMatchesLive: null });
    const c3 = runCorrectness(r).find((v) => v.id === 'C3');
    expect(c3).toMatchObject({ pass: false, skipped: false, detail: 'not measured' });
  });

  it('prints SKIP in the seed report and counts only measured validators in the summary', () => {
    const r = quick();
    r.correctness = runCorrectness(r);
    r.pacing = runPacing(r);
    const report = formatSeedReport(r);
    expect(report).toContain('  SKIP  P3  ');
    expect(report).not.toContain('FAIL  P3');

    const measured = [...r.correctness, ...r.pacing].filter((v) => !v.skipped);
    for (const v of measured) v.pass = true;
    const summary = formatSummary([r]);
    expect(summary).toContain(`ALL PASS — ${measured.length} validators × 1 seeds; ${SKIPPED.length} skipped under --quick`);
    expect(summary).toContain('  SKIP  P10  ');
  });

  it('still fails the summary when a measured validator fails', () => {
    const r = quick();
    r.correctness = runCorrectness(r);
    r.pacing = runPacing(r);
    const p1 = r.pacing.find((v) => v.id === 'P1') as ValidatorResult;
    p1.pass = false;
    expect(formatSummary([r])).toMatch(/^FAIL — \d+ of 11 measured validators/m);
  });
});

// docs/ECONOMY.md's required output names active time, gear curve, pending and
// banked Ascendancy, tree purchases, earnings bonus and abandonments per realm.
describe('every RealmRecord field reaches the report and the CSV', () => {
  const full: RealmRecord = {
    realm: 3,
    startSec: 1000,
    portalReadySec: 4600,
    portalEnterSec: 4660,
    victorySec: 7900,
    roadSec: 3660,
    bossSec: 3240,
    activeSec: 2400,
    bossEtaAtEntrySec: 5400,
    bossActiveEtaAtEntrySec: 3000,
    gearPowerAtEntry: 12345,
    goldPeak: 98765,
    pendingAtVictory: 41.5,
    bankedAfter: 123,
    earningsMultAfter: 1.25,
    treePurchasesTotal: 7,
    abandons: 2,
  };

  it('prints every field in the realm table row', () => {
    const row = formatSeedReport(stubResult({ realms: [full] }))
      .split('\n')
      .find((l) => l.startsWith('   3 ')) as string;
    for (const cell of ['1.02h', '54.0m', '40.0m', '1.50h', '12345', '98765', '41.50', '123', '1.25', ' 7 ', ' 2']) {
      expect(row, cell).toContain(cell);
    }
  });

  it('writes every field as a CSV column, null as an empty cell', () => {
    const keys = Object.keys(full).sort();
    expect([...REALM_CSV_COLUMNS].sort()).toEqual(keys);
    const csv = realmsCsv([full, { ...full, realm: 4, victorySec: null, bankedAfter: null }]);
    const [header, a, b] = csv.trimEnd().split('\n') as [string, string, string];
    expect(header.split(',')).toEqual([...REALM_CSV_COLUMNS]);
    expect(a.split(',')).toHaveLength(REALM_CSV_COLUMNS.length);
    expect(b.split(',')[REALM_CSV_COLUMNS.indexOf('victorySec')]).toBe('');
    expect(b.split(',')[REALM_CSV_COLUMNS.indexOf('bankedAfter')]).toBe('');
    expect(a.split(',')[REALM_CSV_COLUMNS.indexOf('abandons')]).toBe('2');
  });
});

describe('validators are total', () => {
  it('emits every C and P id with a boolean verdict', () => {
    const stub = stubResult();
    const c = runCorrectness(stub);
    const p = runPacing(stub);
    expect(c.map((v) => v.id)).toEqual(['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10']);
    expect(p.map((v) => v.id)).toEqual(['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10']);
    for (const v of [...c, ...p]) expect(typeof v.pass).toBe('boolean');
  });
});

// The readable message list is capped at 20 lines, so a validator that read only
// that list would call its own breach clean once some other breach had filled it.
describe('a full message list cannot hide a breach', () => {
  const noisy = Array.from({ length: 20 }, (_, i) => `t=${i}: gold moved during boss elapsed time`);
  const cases: Array<[BreachKind, string]> = [
    ['auto-entry', 'C1'],
    ['boss-income', 'C2'],
    ['non-finite', 'C9'],
    ['hp-regen', 'C10'],
  ];

  for (const [kind, id] of cases) {
    it(`${id} still fails on a '${kind}' breach with no message left to show it`, () => {
      const verdict = runCorrectness(
        stubResult({ correctnessBreaches: [kind], correctnessLive: noisy }),
      );
      expect(verdict.find((v) => v.id === id)?.pass).toBe(false);
    });
  }

  it('passes every live validator when the breach set is empty', () => {
    const verdict = runCorrectness(stubResult({ correctnessBreaches: [], correctnessLive: noisy }));
    for (const id of ['C1', 'C2', 'C9', 'C10']) {
      expect(verdict.find((v) => v.id === id)?.pass).toBe(true);
    }
  });
});

describe('the idle-return probes measure a return, not a session', () => {
  it('makes no purchase inside the 24h window', () => {
    const s = initialState(5);
    for (let i = 0; i < 24; i++) advance(s, 300);
    botTouch(s); // the last thing the player did before walking away
    const before = { level: s.hero.level, gold: s.gold, banked: s.ascendancy.banked };

    expect(twentyFourHourReturn([s])[0]).toBeGreaterThan(0);
    // The probe clones, so the fixture is untouched either way; what it must not
    // do is spend the gold that accrues inside the window.
    expect(s.hero.level).toBe(before.level);
    expect(s.gold).toBe(before.gold);
    expect(s.ascendancy.banked).toBe(before.banked);
  });
});

describe('spendDepth', () => {
  const sample = (over: Partial<ShopSample>): ShopSample => ({
    timeSec: 0,
    sinceRealmStartSec: SPEND_GRACE_SEC,
    realm: 0,
    affordable: 5,
    priced: 6,
    ...over,
  });

  it('ignores the post-ascension grace window, where gold is zero by design', () => {
    const d = spendDepth([
      sample({ sinceRealmStartSec: 0, affordable: 0 }),
      sample({ sinceRealmStartSec: SPEND_GRACE_SEC - 1, affordable: 0 }),
      sample({ sinceRealmStartSec: SPEND_GRACE_SEC, affordable: 4 }),
    ]);
    expect(d.counted).toBe(1);
    expect(d.minAffordable).toBe(4);
  });

  it('reports the minimum and the realm holding it, not an average', () => {
    const d = spendDepth([
      sample({ realm: 1, affordable: 9 }),
      sample({ realm: 2, affordable: 2 }),
      sample({ realm: 3, affordable: 9 }),
    ]);
    expect(d.minAffordable).toBe(2);
    expect(d.worstRealm).toBe(2);
  });

  it('brackets a starved stretch by the window it sits inside', () => {
    const d = spendDepth([
      sample({ timeSec: 0, affordable: 5 }),
      sample({ timeSec: 30, affordable: 1 }),
      sample({ timeSec: 60, affordable: 1 }),
      sample({ timeSec: 90, affordable: 5 }),
    ]);
    // Starved at 30 and 60, healthy at 0 and 90: the drought began after 0 and
    // ended before 90, so 90 is the honest bound — not the 30 a first-to-last
    // starved-sample measure would report.
    expect(d.longestStarvedSec).toBe(90);
    expect(d.starvedFraction).toBeCloseTo(2 / 4, 10);
  });

  it('gives a drought seen once the interval it hides in, not zero', () => {
    const d = spendDepth([
      sample({ timeSec: 0, affordable: 5 }),
      sample({ timeSec: 30, affordable: 1 }),
      sample({ timeSec: 60, affordable: 5 }),
    ]);
    expect(d.longestStarvedSec).toBe(60);
  });

  it('closes an unbroken starved run that reaches the end of the samples', () => {
    const d = spendDepth([
      sample({ timeSec: 0, affordable: 5 }),
      sample({ timeSec: 30, affordable: 1 }),
      sample({ timeSec: 60, affordable: 1 }),
    ]);
    expect(d.longestStarvedSec).toBe(60);
  });

  it('counts the rich share against the target, not against the minimum', () => {
    const d = spendDepth([
      sample({ affordable: SPEND_TARGET }),
      sample({ affordable: SPEND_TARGET + 3 }),
      sample({ affordable: SPEND_TARGET - 1 }),
      sample({ affordable: 0 }),
    ]);
    expect(d.richFraction).toBeCloseTo(0.5, 10);
    expect(d.minAffordable).toBe(0);
  });

  it('treats no samples as the worst case rather than a silent pass', () => {
    const d = spendDepth([]);
    expect(d.counted).toBe(0);
    expect(d.minAffordable).toBe(0);
    expect(d.richFraction).toBe(0);
    expect(d.starvedFraction).toBe(1);
  });

  it('is fed by real runs: a road run produces looks past the grace window', () => {
    const r = runPlayer(5, cfg({ days: 1 }), { policy: 'road-active', entry: 'prompt' });
    expect(r.shopSamples.length).toBeGreaterThan(0);
    expect(spendDepth(r.shopSamples).counted).toBeGreaterThan(0);
  });
});

/**
 * A ceiling set from a measured distribution is only trustworthy if it rejects
 * the thing it was written to catch. These pin the pre-fix measurements — the
 * ones that motivated P8's starvation clause and P9 — against today's, so a
 * later tuning pass cannot quietly widen either into decoration.
 */
describe('the dead-time and starvation clauses bite', () => {
  const find = (r: SeedResult, id: string) =>
    runPacing(r).find((v) => v.id === id) as { id: string; pass: boolean; detail: string };

  it('P8 fails on a panel that goes all grey, and passes on today', () => {
    const main = stubResult();
    expect(find(main, 'P8').pass).toBe(true);
    expect(main.spendDepth.minAffordable).toBeGreaterThanOrEqual(1);

    // The capped-tree game: every row priced, none of them buyable.
    const allGrey = stubResult({
      spendDepth: { ...main.spendDepth, minAffordable: 0 },
    });
    expect(find(allGrey, 'P8').pass).toBe(false);
  });

  it('P8 fails on a long drought even when the panel is never fully grey', () => {
    const main = stubResult();
    const starved = stubResult({
      spendDepth: {
        ...main.spendDepth,
        minAffordable: 1,
        starvedFraction: 0.2,
        longestStarvedSec: 4 * 3600,
      },
    });
    expect(find(starved, 'P8').pass).toBe(false);
  });

  it('P9 fails on the pre-fix dead time, and passes on today', () => {
    const main = stubResult();
    expect(find(main, 'P9').pass).toBe(true);

    // Measured on bossHpMult 30000 / BOSS_REALM_GAIN 1.22: the Road ended ~34x
    // short of its own guardian, so the player farmed a cleared realm.
    const preFix = stubResult({
      deadTime: {
        ...main.deadTime,
        longestSec: 14.74 * 3600,
        fraction: 0.56,
        slowestRealmDays: 1.01,
        realms: 30,
      },
    });
    const v = find(preFix, 'P9');
    expect(v.pass).toBe(false);
    expect(v.detail).toContain('56% of Road time waiting');
  });

  it('P9 fails on a realm cadence that degrades past three days', () => {
    const main = stubResult();
    const slow = stubResult({
      deadTime: { ...main.deadTime, slowestRealmDays: 3.5, realms: 30 },
    });
    expect(find(slow, 'P9').pass).toBe(false);
  });

  it('P9 fails on a portal parked open for longer than a day', () => {
    const main = stubResult();
    const parked = stubResult({
      deadTime: { ...main.deadTime, longestSec: 76 * 3600, realms: 30 },
    });
    expect(find(parked, 'P9').pass).toBe(false);
  });
});

/**
 * P10's band is stated at a fixed checkpoint, so a run that does not reach it
 * must say so rather than judge a short measurement against a long bar. That
 * mismatch is what made bare `npm run sim` print a red line meaning "you used
 * the wrong flags", which teaches people to ignore red.
 */
const uplift = (over: Partial<NonNullable<SeedResult['permanentUplift']>> = {}) => ({
  horizonSec: PERMANENT_HORIZON_SEC,
  reachedHorizon: true,
  measuredAtSec: PERMANENT_HORIZON_SEC,
  idleEarned: 1000,
  activeEarned: 1840,
  ratio: 1.84,
  idleFirstAscensionSec: 14 * 3600,
  activeFirstAscensionSec: 11 * 3600,
  rankTarget: 20,
  idleRankSec: 4.5 * 86_400,
  activeRankSec: 3.5 * 86_400,
  sweep: [],
  contentEndRealm: null,
  contentEndSec: null,
  ...over,
});

describe('P10 bands at a checkpoint, not at the run length', () => {
  const p10 = (r: SeedResult) =>
    runPacing(r).find((v) => v.id === 'P10') as { pass: boolean; detail: string };

  it('passes on the measured middle of the band', () => {
    expect(p10(stubResult({ permanentUplift: uplift() })).pass).toBe(true);
  });

  it('fails outside the band once the checkpoint is reached', () => {
    expect(p10(stubResult({ permanentUplift: uplift({ ratio: 1.2 }) })).pass).toBe(false);
    expect(p10(stubResult({ permanentUplift: uplift({ ratio: 3.0 }) })).pass).toBe(false);
  });

  it('leaves the ratio unbanded, and says so, on a run that stops short', () => {
    const short = uplift({
      reachedHorizon: false,
      measuredAtSec: 7 * 86_400,
      ratio: 1.2, // would fail the band, and must not be judged by it
    });
    const v = p10(stubResult({ permanentUplift: short }));
    expect(v.pass).toBe(true);
    expect(v.detail).toContain('not banded');
    expect(v.detail).toContain('band is stated at');
  });

  it('still bands the sooner-clause on a short run, so it cannot pass vacuously', () => {
    const short = uplift({
      reachedHorizon: false,
      measuredAtSec: 7 * 86_400,
      activeFirstAscensionSec: 13.9 * 3600, // 1.01x sooner — nowhere near the floor
    });
    expect(p10(stubResult({ permanentUplift: short })).pass).toBe(false);
  });

  it('names content end beside the ratio, and only when a run reached it', () => {
    const plain = p10(stubResult({ permanentUplift: uplift() })).detail;
    expect(plain).not.toContain('content end');

    const ended = p10(
      stubResult({
        permanentUplift: uplift({ contentEndRealm: 301, contentEndSec: 76.5 * 86_400 }),
      }),
    ).detail;
    expect(ended).toContain('capped at content end');
    expect(ended).toContain('realm 301');
    expect(ended).toContain('76.50d');
    // The band still applies at the checkpoint — the clause labels, never excuses.
    expect(p10(stubResult({ permanentUplift: uplift({ ratio: 1.2, contentEndRealm: 301, contentEndSec: 76.5 * 86_400 }) })).pass).toBe(false);
  });
});

/**
 * A frozen numerator over a growing denominator makes a hyperbola that reads
 * like a pacing collapse. The report has to say the run ran out of ladder, or
 * every future reader re-derives it (docs/DECISIONS.md #48).
 */
/**
 * The sweep is the reproducible form of the day-90 finding. Its whole job is
 * the guard: `earnedAt` carries the last trail value forward, so an unguarded
 * checkpoint past a run's end reports a frozen numerator over a growing
 * denominator and reads as a pacing collapse (docs/DECISIONS.md #48).
 */
/**
 * A 20-minute session is 2.8% of a 12-hour cycle, so a beat placed anywhere in
 * wall-clock time is one the player misses. The probe has to tell "inside a
 * session" from "while away" exactly, or it reports that share back as a finding.
 */
describe('witnessedBeats separates what the player saw from what happened while away', () => {
  const cfgW = cfg({ sessionMin: 20, sessionsPerDay: 2 });
  const CYCLE = 43_200;
  const realm = (over: Partial<RealmRecord>): RealmRecord =>
    ({
      realm: 1,
      startSec: 0,
      portalReadySec: null,
      portalEnterSec: null,
      victorySec: null,
      roadSec: null,
      bossSec: 0,
      activeSec: 0,
      bossEtaAtEntrySec: null,
      bossActiveEtaAtEntrySec: null,
      gearPowerAtEntry: 0,
      goldPeak: 0,
      ...over,
    }) as RealmRecord;

  const felled = (w: ReturnType<typeof witnessedBeats>) =>
    w?.beats.find((b) => b.name === 'guardian felled');

  it('counts a victory inside the session window and not one in the gap', () => {
    const w = witnessedBeats(cfgW, [
      realm({ victorySec: 60 }), // minute 1 of the first session
      realm({ victorySec: 1_199 }), // last second of it
      realm({ victorySec: 1_200 }), // first second of the gap
      realm({ victorySec: CYCLE - 1 }), // still away
      realm({ victorySec: CYCLE + 30 }), // minute 0.5 of the next session
    ]);
    expect(felled(w)).toEqual({ name: 'guardian felled', inSession: 3, total: 5 });
  });

  it('ignores realms that never reached a beat', () => {
    const w = witnessedBeats(cfgW, [realm({}), realm({ victorySec: 60 })]);
    expect(felled(w)).toEqual({ name: 'guardian felled', inSession: 1, total: 1 });
  });

  it('reports the chance rate a result has to beat to mean anything', () => {
    const w = witnessedBeats(cfgW, [realm({ victorySec: 60 })]);
    expect(w?.baseline).toBeCloseTo(1_200 / CYCLE, 6);
  });

  it('declines to measure a run with no gap to be absent during', () => {
    expect(witnessedBeats(cfg({ sessionMin: 720, sessionsPerDay: 2 }), [])).toBeNull();
  });

  it('sees the real gap on a real run, not a constructed one', () => {
    const w = witnessedBeats(cfg(WEEK), weekRun().realms);
    const v = felled(w);
    expect(v!.total).toBeGreaterThan(0);
    // The finding this probe exists for: the guardian dies while nobody watches.
    expect(v!.inSession / v!.total).toBeLessThan(0.5);
  });
});

describe('the horizon sweep reports no data rather than a carried value', () => {
  const pt = (sec: number, ratio: number | null, blocked: HorizonPoint['blocked']) => ({
    sec,
    ratio,
    blocked,
  });

  it('prints a measurable checkpoint and blanks one past content end', () => {
    const out = formatSeedReport(
      stubResult({
        frontierRealm: 301,
        frontierSec: 76.31 * 86_400,
        permanentUplift: uplift({
          contentEndRealm: 301,
          contentEndSec: 76.31 * 86_400,
          sweep: [pt(75 * 86_400, 1.78, null), pt(90 * 86_400, null, 'content-end')],
        }),
      }),
    );
    expect(out).toContain('horizon sweep');
    expect(out).toContain('75.00d 1.78x');
    expect(out).toContain('90.00d —');
    expect(out).toContain('past content end');
    expect(out).toContain('realm 301');
    // The number that misleads must not appear anywhere in the block.
    expect(out).not.toContain('1.17');
  });

  it('names a short run differently from a run that ran out of ladder', () => {
    const short = formatSeedReport(
      stubResult({
        frontierRealm: null,
        frontierSec: null,
        permanentUplift: uplift({ sweep: [pt(30 * 86_400, null, 'run-length')] }),
      }),
    );
    expect(short).toContain('past the run length');
    expect(short).not.toContain('past content end');
  });

  it('says nothing at all when every checkpoint was measurable', () => {
    const clean = formatSeedReport(
      stubResult({ permanentUplift: uplift({ sweep: [pt(14 * 86_400, 1.84, null)] }) }),
    );
    expect(clean).toContain('14.00d 1.84x');
    expect(clean).not.toContain('not measurable');
  });

  it('offers only checkpoints inside the run, and measures every one it offers', () => {
    const short = cfg(WEEK);
    const pu = permanentUplift(1, short, weekRun());
    expect(pu).not.toBeNull();
    // Clipped to the run: 14d and beyond are never offered at --days 7.
    expect(pu!.sweep.map((h) => h.sec / 86_400)).toEqual([3, 7]);
    for (const h of pu!.sweep) {
      expect(h.ratio, `${h.sec / 86_400}d`).not.toBeNull();
      expect(h.blocked).toBeNull();
    }
  });

  it('blocks every checkpoint past a run that stopped early, from the real probe', () => {
    const short = cfg({ days: 7 });
    // Stopping at the first victory puts the active run's end well before the
    // 3d checkpoint, which is the same shape as stopping at content end.
    const stopped = runPlayer(1, short, {
      policy: 'road-active',
      entry: 'prompt',
      maxVictories: 1,
    });
    expect(stopped.state.timeSec).toBeLessThan(3 * 86_400);
    const pu = permanentUplift(1, short, stopped);
    expect(pu).not.toBeNull();
    expect(pu!.sweep.map((h) => h.sec / 86_400)).toEqual([3, 7]);
    for (const h of pu!.sweep) {
      expect(h.ratio, `${h.sec / 86_400}d`).toBeNull();
      expect(h.blocked).toBe('run-length');
    }
    // No frontier was met, so it must not be blamed on content end.
    expect(pu!.contentEndRealm).toBeNull();
  });
});

describe('the seed report calls content end what it is', () => {
  it('names the realm, the day, and why no later ratio measures pacing', () => {
    const quiet = formatSeedReport(stubResult({ frontierRealm: null, frontierSec: null }));
    expect(quiet).not.toContain('frontier:');
    expect(quiet).not.toContain('content end');

    const ended = formatSeedReport(
      stubResult({ frontierRealm: 301, frontierSec: 76.5 * 86_400 }),
    );
    expect(ended).toContain('realm 301');
    expect(ended).toContain('76.50d');
    expect(ended).toContain('content end, not a stall');
    expect(ended).toContain('frozen total by a growing one');
  });
});
