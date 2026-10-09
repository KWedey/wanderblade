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
import { enterPortal, FULL_LENGTH_REALM, type GameState } from '@wanderblade/core';
import type { PortalReach } from './types';

/** Road snapshots spread across the run, for the windowed probes. */
function roadSnapshots(samplesOwner: GameState[], want: number): GameState[] {
  const road = samplesOwner.filter((s) => s.phase === 'road');
  if (road.length <= want) return road;
  const step = road.length / want;
  const out: GameState[] = [];
  for (let i = 0; i < want; i++) out.push(road[Math.floor(i * step)] as GameState);
  return out;
}

/** Everything the headline run alone can report; every probe still unmeasured. */
function unmeasuredResult(
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
    portalReach: [],
    promptVsOverfarm: null,
    abandonProbe: null,
    frontierRealm: main.frontierRealm,
    frontierSec: main.frontierSec,
    spendDepth: spendDepth(main.shopSamples),
    deadTime: deadTime(main.realms),
    permanentUplift: null,
    witnessed: witnessedBeats(config, main.realms),
    totalKills: main.state.killIndex,
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

  // Realm start → portal available, measured separately per policy, for the
  // tutorial realm and the first full-length one. P5's "active" is hours of
  // play, not hours of elapsed time, so that probe plays without pause; the
  // idle one walks the sim's own schedule and buys only when it checks in.
  const reachTo = (realm: number, policy: 'road-idle' | 'road-active') =>
    runPlayer(seed, config, {
      policy,
      entry: 'prompt',
      stopAtPortalReadyRealm: realm,
      continuous: policy === 'road-active',
    });
  const roadOf = (run: ReturnType<typeof runPlayer>, realm: number): number | null => {
    const r = run.realms.find((x) => x.realm === realm);
    return r === undefined || r.portalReadySec === null ? null : r.portalReadySec - r.startSec;
  };
  const idleReach = reachTo(0, 'road-idle');
  const activeReach = reachTo(0, 'road-active');
  const portalReach: PortalReach[] = [
    { realm: 0, idle: roadOf(idleReach, 0), active: roadOf(activeReach, 0) },
  ];
  if (!config.quick) {
    const full = FULL_LENGTH_REALM;
    portalReach.push({
      realm: full,
      idle: roadOf(reachTo(full, 'road-idle'), full),
      active: roadOf(reachTo(full, 'road-active'), full),
    });
  }

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
  const fast: SeedResult = {
    ...unmeasuredResult(seed, config, main),
    roadUplift: roadUplift(roadStates),
    roadWindowUplift: roadWindowUplift(roadStates),
    bossUplift: bossUplift(entryStates),
    portalReach,
  };
  const result: SeedResult = config.quick
    ? fast
    : {
        ...fast,
        eightHourBuys: eightHourReturn(walkingStates),
        twentyFourHourZones: twentyFourHourReturn(walkingStates),
        promptVsOverfarm: promptVsOverfarm(seed, config),
        abandonProbe: abandonProbe(readyState),
        permanentUplift: permanentUplift(seed, config, main),
        offlineMatchesLive: offlineMatchesLive(readyState),
        replayIdentical: replayIdentical(idleReach.state),
        abandonClean: abandonClean(readyState),
        remainingTimeCarried: remainingTimeCarried(readyState),
        earningsBonusIsolated: earningsBonusIsolated(main.state),
      };

  result.correctness = runCorrectness(result);
  result.pacing = runPacing(result);
  return result;
}
