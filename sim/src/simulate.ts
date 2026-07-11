// Drives one seed's run: the first active session, then discrete check-ins at
// the configured cadence, with untouched advance() between touches. Produces a
// SeedResult (validators are computed separately in validators.ts).

import {
  advance,
  gearPowerTotal,
  heroDps,
  initialState,
  readiness,
  summarizeEvents,
  type GameState,
} from '@wanderblade/core';
import { botBuy, botTouch } from './bot';
import { Collector, regionOf } from './collector';
import type { CheckinRecord, SimConfig, SeedResult } from './types';

const SEC_PER_DAY = 86_400;
const SEC_PER_HOUR = 3_600;

/** First active session length and bot cadence within it. */
const ACTIVE_SESSION_SEC = 10 * 60; // minutes 0-10
const ACTIVE_STEP_SEC = 5;

/** 8h-return probe (validator 4): time away modeled as a return after 8h. */
const EIGHT_HOUR_SEC = 8 * SEC_PER_HOUR;

/**
 * Advance sub-step cap. Small enough that a single advance never approaches the
 * core's EVENT_CAP (50k): the kill-time floor is minKillTimeSec = 2s → ≤ 1,800
 * kills/hour, so a one-hour sub-step yields at most ~1,800 kill events, far
 * under the cap. The kill event stream is never truncated and the trash
 * kill-time deltas stay exact.
 */
const SAMPLE_STEP_SEC = SEC_PER_HOUR;

/** Advance `seconds` of game time in event-cap-safe sub-steps, folding events. */
function runInterval(state: GameState, seconds: number, collector: Collector): void {
  let remaining = seconds;
  while (remaining > 0) {
    const step = Math.min(SAMPLE_STEP_SEC, remaining);
    const events = advance(state, step);
    collector.processEvents(events);
    collector.addRecap(summarizeEvents(events));
    remaining -= step;
  }
}

/** Median of a numeric list (0 if empty). */
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * 8h-return probe: from a freshly-spent steady-state snapshot, advance 8h with
 * no touches (auto-challenge still active), then measure how many purchases the
 * bot can afford on return. Runs on a clone; never affects the main run.
 */
function eightHourProbe(state: GameState): number {
  // structuredClone (not core's JSON serialize) so a non-finite balance in the
  // endless tail round-trips exactly — JSON.stringify(Infinity) is `null`.
  const clone = structuredClone(state);
  const scratch = new Collector();
  runInterval(clone, EIGHT_HOUR_SEC, scratch);
  return botBuy(clone, scratch);
}

export function simulateSeed(seed: number, config: SimConfig): SeedResult {
  const totalSec = config.days * SEC_PER_DAY;
  const interval = SEC_PER_DAY / config.checkinsPerDay;

  const state = initialState(seed);
  const collector = new Collector();
  const checkins: CheckinRecord[] = [];

  // --- First active session (minutes 0-10): bot touches every 5s ----------
  let activeSessionPurchases = 0;
  let t = 0;
  while (t < ACTIVE_SESSION_SEC) {
    runInterval(state, ACTIVE_STEP_SEC, collector);
    t += ACTIVE_STEP_SEC;
    activeSessionPurchases += botTouch(state, collector);
  }
  let clock = ACTIVE_SESSION_SEC;

  // --- Discrete check-ins at the configured cadence -----------------------
  // Check-ins land at k·interval; any within the active session are skipped
  // (the player was already actively playing then).
  let checkinIndex = 0;
  for (let k = 1; k * interval <= totalSec + 1e-6; k++) {
    const tc = k * interval;
    if (tc <= ACTIVE_SESSION_SEC) continue;

    runInterval(state, tc - clock, collector);
    clock = tc;

    // Snapshot arrival (pre-spend) state.
    const arrivalZone = state.zone;
    const arrivalGold = state.gold;
    const dps = heroDps(state);
    const rdy = readiness(state);
    const gearPower = gearPowerTotal(state.gear);
    const leagues = state.leagues;
    const heroLevel = state.hero.level;

    const purchases = botTouch(state, collector);
    const afterDay1 = tc >= SEC_PER_DAY;

    // 8h-return probe from this freshly-spent steady-state (after day 1 only),
    // provided a full 8h window still fits inside the run horizon.
    let probe: number | null = null;
    if (afterDay1 && tc + EIGHT_HOUR_SEC <= totalSec) {
      probe = eightHourProbe(state);
    }

    checkins.push({
      index: checkinIndex++,
      timeSec: tc,
      day: Math.floor(tc / SEC_PER_DAY) + 1,
      afterDay1,
      arrivalZone,
      arrivalRegion: regionOf(arrivalZone),
      arrivalGold,
      leagues,
      heroLevel,
      gearPower,
      dps,
      readiness: rdy,
      purchases,
      eightHourProbePurchases: probe,
    });
  }

  // Ensure the clock reaches the full horizon even if cadence left a remainder.
  if (clock < totalSec) {
    runInterval(state, totalSec - clock, collector);
    clock = totalSec;
  }

  const gates = collector.gateRecords(totalSec);
  const probeSamples = checkins
    .map((c) => c.eightHourProbePurchases)
    .filter((p): p is number => p !== null);

  const result: SeedResult = {
    seed,
    config,
    checkins,
    gates,
    validators: [], // filled by validators.ts
    firstPurchaseSec: collector.firstPurchaseSec,
    firstBossSec: collector.firstBossSec,
    firstBossTooFast: collector.firstBossSec !== null && collector.firstBossSec < 5 * 60,
    maxTrashKillTime: collector.maxTrashKillTime,
    maxTrashKillTimeZone: collector.maxTrashKillTimeZone,
    maxTrashKillTimeSec: collector.maxTrashKillTimeSec,
    finalZone: state.zone,
    finalRegion: regionOf(state.zone),
    finalLeagues: state.leagues,
    finalGold: state.gold,
    worldsEdgeReached: state.worldsEdgeReached,
    totalKills: collector.kills,
    totalGold: collector.goldEarned,
    totalDrops: collector.drops,
    totalEquips: collector.equips,
    activeSessionPurchases,
    eightHourMedian: median(probeSamples),
    eightHourSamples: probeSamples,
  };
  return result;
}
