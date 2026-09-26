// One seed, measured end to end: the headline multi-realm run, the per-policy
// reach probes, the direct correctness experiments and every A/B probe, then
// the PASS/FAIL verdicts. Pure — the CLI and the gate test both call it.

import {
  abandonClean,
  earningsBonusIsolated,
  offlineMatchesLive,
  remainingTimeCarried,
  replayIdentical,
} from './checks';
import {
  abandonProbe,
  bossUplift,
  deadTime,
  permanentUplift,
  witnessedBeats,
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
    frontierRealm: main.frontierRealm,
    frontierSec: main.frontierSec,
    spendDepth: spendDepth(main.shopSamples),
    deadTime: deadTime(main.realms),
    permanentUplift: null,
    witnessed: witnessedBeats(config, main.realms),
    totalKills: main.state.lifetime.kills,
    finalRealm: main.state.realm,
    victories: main.state.ascendancy.victories,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: null,
    replayIdentical: null,
    abandonClean: null,
    remainingTimeCarried: null,
    earningsBonusIsolated: null,
  };
}

export function simulateSeed(seed: number, config: SimConfig): SeedResult {
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
    frontierRealm: main.frontierRealm,
    frontierSec: main.frontierSec,
    spendDepth: spendDepth(main.shopSamples),
    deadTime: deadTime(main.realms),
    witnessed: witnessedBeats(config, main.realms),
    permanentUplift: permanentUplift(seed, config, main),
    totalKills: main.state.lifetime.kills,
    finalRealm: main.state.realm,
    victories: main.state.ascendancy.victories,
    correctnessBreaches: main.breaches,
    correctnessLive: main.violations,
    offlineMatchesLive: offlineMatchesLive(readyState),
    replayIdentical: replayIdentical(clone(idleReach.state)),
    abandonClean: abandonClean(readyState),
    remainingTimeCarried: remainingTimeCarried(readyState),
    earningsBonusIsolated: earningsBonusIsolated(clone(main.state)),
  };

  result.correctness = runCorrectness(result);
  result.pacing = runPacing(result);
  return result;
}
