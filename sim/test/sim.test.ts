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
import { parseArgs } from '../src/args';
import { botBuyGold, botBuyTree, botTouch } from '../src/bot';
import { aimAtOldestArc, CAP_RATE, runIdle, strikeThrough, strikeTimes } from '../src/policy';
import {
  deadTime,
  spendDepth,
  SPEND_GRACE_SEC,
  SPEND_TARGET,
  twentyFourHourReturn,
} from '../src/probes';
import { runPlayer } from '../src/simulate';
import { runCorrectness, runPacing } from '../src/validators';
import type { BreachKind, SeedResult, ShopSample, SimConfig } from '../src/types';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  days: 1,
  seed: 1,
  seeds: 1,
  sessionMin: 20,
  sessionsPerDay: 2,
  csv: false,
  quick: false,
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
    expect(s.lifetime.kills).toBeGreaterThan(0);
  });

  it('strikeThrough moves the clock with no onEvents, striking and idle alike', () => {
    const striking = initialState(11);
    strikeThrough(striking, 600, CAP_RATE);
    expect(striking.timeSec).toBeGreaterThanOrEqual(600 - 1e-9);
    expect(striking.lifetime.kills).toBeGreaterThan(0);

    const idle = initialState(11);
    strikeThrough(idle, 600, 0);
    expect(idle.timeSec).toBeGreaterThanOrEqual(600 - 1e-9);
    expect(idle.lifetime.kills).toBeGreaterThan(0);
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
    expect(a.state.lifetime.kills).toBe(b.state.lifetime.kills);
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
    spendDepth: spendDepth(main.shopSamples),
    deadTime: deadTime(main.realms),
    permanentUplift: null,
    totalKills: main.state.lifetime.kills,
    finalRealm: main.state.realm,
    victories: 0,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: true,
    offlineMatchesLiveDetail: '',
    replayIdentical: true,
    replayIdenticalDetail: '',
    abandonClean: true,
    abandonCleanDetail: '',
    remainingTimeCarried: true,
    remainingTimeCarriedDetail: '',
    earningsBonusIsolated: true,
    earningsBonusIsolatedDetail: '',
    ...over,
  };
}

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
