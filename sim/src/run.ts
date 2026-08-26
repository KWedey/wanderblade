// Wanderblade economy simulator — entry point.
//
// Runs every policy in docs/ECONOMY.md's simulator contract across N seeds and
// prints the correctness and pacing PASS/FAIL summary. It reports honest
// results; it never tunes constants.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HELP, parseArgs } from './args';
import {
  abandonClean,
  earningsBonusIsolated,
  offlineMatchesLive,
  remainingTimeCarried,
  replayIdentical,
} from './checks';
import { formatSeedReport, formatSummary, writeCsv } from './format';
import {
  abandonProbe,
  bossUplift,
  eightHourReturn,
  promptVsOverfarm,
  roadUplift,
  roadWindowUplift,
  spendDepth,
  twentyFourHourReturn,
} from './probes';
import { clone, runPlayer } from './simulate';
import { runCorrectness, runPacing } from './validators';
import type { SeedResult, SimConfig } from './types';
import { enterPortal, type GameState } from '@wanderblade/core';

/** Road snapshots spread across the run, for the windowed probes. */
function roadSnapshots(samplesOwner: GameState[], want: number): GameState[] {
  const road = samplesOwner.filter((s) => s.phase === 'road');
  if (road.length <= want) return road;
  const step = road.length / want;
  const out: GameState[] = [];
  for (let i = 0; i < want; i++) out.push(road[Math.floor(i * step)] as GameState);
  return out;
}

function emptyResult(
  seed: number,
  config: SimConfig,
  main: ReturnType<typeof runPlayer>,
): SeedResult {
  return {
    seed,
    config,
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
    spendDepth: spendDepth(main.shopSamples),
    totalKills: main.state.lifetime.kills,
    finalRealm: main.state.realm,
    victories: main.state.ascendancy.victories,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: true,
    offlineMatchesLiveDetail: 'skipped (--quick)',
    replayIdentical: true,
    replayIdenticalDetail: 'skipped (--quick)',
    abandonClean: true,
    abandonCleanDetail: 'skipped (--quick)',
    remainingTimeCarried: true,
    remainingTimeCarriedDetail: 'skipped (--quick)',
    earningsBonusIsolated: true,
    earningsBonusIsolatedDetail: 'skipped (--quick)',
  };
}

function simulateSeed(seed: number, config: SimConfig): SeedResult {
  // The headline multi-realm run: an active player who commits promptly. In
  // quick mode it stops at the first victory, which is all the fast bands need.
  const main = runPlayer(seed, config, {
    policy: 'road-active',
    entry: 'prompt',
    maxVictories: config.quick ? 1 : undefined,
  });

  // Realm 0 start → portal available, measured separately per policy.
  const idleReach = runPlayer(seed, config, {
    policy: 'road-idle',
    entry: 'prompt',
    stopAtPortalReady: true,
  });
  // P5's "active" is hours of play, not hours of elapsed time, so the reach
  // probe plays without pause.
  const activeReach = runPlayer(seed, config, {
    policy: 'road-active',
    entry: 'prompt',
    stopAtPortalReady: true,
    continuous: true,
  });

  // A portal-ready Road state is the shared fixture for the boss experiments.
  const readyState = clone(activeReach.state);
  const entryStates: GameState[] = [];
  for (const r of main.realms) {
    if (r.portalEnterSec === null) continue;
    const at = main.snapshots.get(r.realm);
    if (at) entryStates.push(at);
  }
  if (entryStates.length === 0) {
    const s = clone(readyState);
    if (enterPortal(s).entered) entryStates.push(s);
  }

  const roadStates = roadSnapshots(main.roadStates, 6);
  // The idle-return bands describe a player still walking a road; one whose
  // portal is already open progresses by fighting, not by clearing zones.
  const walkingStates = roadSnapshots(
    main.roadStates.filter((s) => !s.portalReady),
    6,
  );
  if (config.quick) {
    const quick: SeedResult = {
      ...emptyResult(seed, config, main),
      roadUplift: roadUplift(roadStates),
      roadWindowUplift: roadWindowUplift(roadStates),
      bossUplift: bossUplift(entryStates),
      portalReachSec: {
        idle: idleReach.realms[0]?.portalReadySec ?? null,
        active: activeReach.realms[0]?.portalReadySec ?? null,
      },
    };
    quick.correctness = runCorrectness(quick);
    quick.pacing = runPacing(quick);
    return quick;
  }
  const offline = offlineMatchesLive(readyState);
  const replay = replayIdentical(clone(idleReach.state));
  const abandon = abandonClean(readyState);
  const carried = remainingTimeCarried(readyState);
  const earnings = earningsBonusIsolated(clone(main.state));

  const result: SeedResult = {
    seed,
    config,
    realms: main.realms,
    samples: main.samples,
    correctness: [],
    pacing: [],
    roadUplift: roadUplift(roadStates),
    roadWindowUplift: roadWindowUplift(roadStates),
    bossUplift: bossUplift(entryStates),
    eightHourBuys: eightHourReturn(walkingStates),
    twentyFourHourZones: twentyFourHourReturn(walkingStates),
    portalReachSec: {
      idle: idleReach.realms[0]?.portalReadySec ?? null,
      active: activeReach.realms[0]?.portalReadySec ?? null,
    },
    promptVsOverfarm: promptVsOverfarm(seed, config),
    abandonProbe: abandonProbe(readyState),
    spendDepth: spendDepth(main.shopSamples),
    totalKills: main.state.lifetime.kills,
    finalRealm: main.state.realm,
    victories: main.state.ascendancy.victories,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: offline.pass,
    offlineMatchesLiveDetail: offline.detail,
    replayIdentical: replay.pass,
    replayIdenticalDetail: replay.detail,
    abandonClean: abandon.pass,
    abandonCleanDetail: abandon.detail,
    remainingTimeCarried: carried.pass,
    remainingTimeCarriedDetail: carried.detail,
    earningsBonusIsolated: earnings.pass,
    earningsBonusIsolatedDetail: earnings.detail,
  };

  result.correctness = runCorrectness(result);
  result.pacing = runPacing(result);
  return result;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    process.stdout.write(HELP + '\n');
    return;
  }
  const config = parsed;

  const out: string[] = [];
  out.push('Wanderblade — Road / Portal Boss / Ascension economy simulator');
  out.push(
    `config: days=${config.days} seeds=${config.seed}..${config.seed + config.seeds - 1} ` +
      `sessions=${config.sessionsPerDay}×${config.sessionMin}min csv=${config.csv}`,
  );

  const results: SeedResult[] = [];
  const csvDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
  const csvPaths: string[] = [];

  for (let i = 0; i < config.seeds; i++) {
    const result = simulateSeed(config.seed + i, config);
    results.push(result);
    out.push(formatSeedReport(result));
    if (config.csv) csvPaths.push(writeCsv(result, csvDir));
  }

  out.push(formatSummary(results));
  if (csvPaths.length > 0) {
    out.push('');
    out.push('CSV written:');
    for (const p of csvPaths) out.push(`  ${p}`);
  }

  process.stdout.write(out.join('\n') + '\n');
  process.exitCode = 0;
}

main();
