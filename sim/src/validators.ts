// The PASS/FAIL contract. C-validators are the correctness list in
// docs/ECONOMY.md "Redesigned simulator contract"; P-validators are the pacing
// bands in docs/ACTIVE-PLAY.md. Both are pure functions of a SeedResult.

import { BOSS_MAX_SEC, BOSS_MIN_SEC, SEC_PER_DAY, SEC_PER_HOUR } from './policy';
import {
  MAX_PORTAL_WAIT_FRACTION,
  MAX_PORTAL_WAIT_SEC,
  MAX_REALM_DAYS,
  PERMANENT_HORIZON_SEC,
  PERMANENT_RATIO_MAX,
  PERMANENT_RATIO_MIN,
  PERMANENT_SOONER_MIN,
  SPEND_MAX_DROUGHT_SEC,
  SPEND_MAX_STARVED_FRACTION,
  SPEND_PRICED_FLOOR,
  SPEND_TARGET,
} from './probes';
import type { BreachKind, SeedResult, Uplift, ValidatorResult } from './types';

export function fmtTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return 'never';
  if (sec < 90) return `${sec.toFixed(1)}s`;
  if (sec < SEC_PER_HOUR) return `${(sec / 60).toFixed(1)}m`;
  if (sec < SEC_PER_DAY) return `${(sec / SEC_PER_HOUR).toFixed(2)}h`;
  return `${(sec / SEC_PER_DAY).toFixed(2)}d`;
}

function ok(id: string, name: string, pass: boolean, detail: string): ValidatorResult {
  return { id, name, pass, detail };
}

function ratios(list: Uplift[]): number[] {
  return list.map((u) => u.ratio).filter((r) => Number.isFinite(r));
}

function range(xs: number[]): string {
  if (xs.length === 0) return 'no samples';
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${min.toFixed(2)}–${max.toFixed(2)} (mean ${mean.toFixed(2)}, n=${xs.length})`;
}

function inBand(xs: number[], lo: number, hi: number): boolean {
  return xs.length > 0 && xs.every((x) => x >= lo && x <= hi);
}

// --- Correctness ---------------------------------------------------------

export function runCorrectness(r: SeedResult): ValidatorResult[] {
  const out: ValidatorResult[] = [];
  const entered = r.realms.filter((x) => x.portalEnterSec !== null);
  const won = r.realms.filter((x) => x.victorySec !== null);
  const clean = (kind: BreachKind): boolean => !r.correctnessBreaches.includes(kind);
  /** The capped message lines belonging to `kind`, for the FAIL detail. */
  const why = (match: string): string => r.correctnessLive.filter((v) => v.includes(match)).join('; ');

  out.push(
    ok(
      'C1',
      'No automatic portal entry, online or offline',
      clean('auto-entry'),
      clean('auto-entry')
        ? `${entered.length} entries, all explicit`
        : why('no explicit action') || 'the boss phase was entered with no explicit action',
    ),
  );
  out.push(
    ok(
      'C2',
      'No Road income during boss elapsed time',
      clean('boss-income'),
      clean('boss-income')
        ? 'gold, gear, pending, road, collection all frozen'
        : why('during boss') || 'a Road resource moved during boss elapsed time',
    ),
  );
  out.push(
    ok('C3', 'Offline boss HP equals live boss HP', r.offlineMatchesLive, r.offlineMatchesLiveDetail),
  );
  out.push(
    ok(
      'C4',
      'Identical timestamped inputs give identical results',
      r.replayIdentical,
      r.replayIdenticalDetail,
    ),
  );
  out.push(
    ok(
      'C5',
      'Abandonment resets boss progress only, never banks',
      r.abandonClean,
      r.abandonCleanDetail,
    ),
  );
  out.push(
    ok(
      'C6',
      'Victory banks, rewards, resets, unlocks exactly once',
      r.victories === won.length && won.every((x) => x.bankedAfter !== null),
      `${r.victories} victories, ${won.length} recorded ascensions`,
    ),
  );
  out.push(
    ok(
      'C7',
      'Remaining offline time advances the next realm Road',
      r.remainingTimeCarried,
      r.remainingTimeCarriedDetail,
    ),
  );
  out.push(
    ok(
      'C8',
      'Earnings bonus moves gold and never DPS',
      r.earningsBonusIsolated,
      r.earningsBonusIsolatedDetail,
    ),
  );
  out.push(
    ok(
      'C9',
      'No non-finite HP, DPS, currency, duration, or multiplier',
      clean('non-finite'),
      clean('non-finite')
        ? 'every watched slice finite'
        : why('non-finite') || 'a non-finite value reached client state',
    ),
  );
  out.push(
    ok(
      'C10',
      'Guardian HP never regenerates',
      clean('hp-regen'),
      clean('hp-regen') ? 'monotonic across every attempt' : why('regenerated'),
    ),
  );
  return out;
}

// --- Pacing --------------------------------------------------------------

export function runPacing(r: SeedResult): ValidatorResult[] {
  const out: ValidatorResult[] = [];

  const road = ratios(r.roadUplift);
  out.push(
    ok('P1', 'Road active vs idle gold, 20 min: 1.8–2.2x', inBand(road, 1.8, 2.2), range(road)),
  );

  const boss = ratios(r.bossUplift);
  out.push(
    ok('P2', 'Boss active vs zero-tap: 1.4–1.8x faster', inBand(boss, 1.4, 1.8), range(boss)),
  );

  const eight = r.eightHourBuys;
  out.push(
    ok(
      'P3',
      '8h idle return affords ≥1 upgrade',
      eight.length > 0 && eight.every((n) => n >= 1),
      `buys ${range(eight)}`,
    ),
  );

  const day = r.twentyFourHourZones;
  out.push(
    ok(
      'P4',
      '24h idle return advances ≥1 zone',
      day.length > 0 && day.every((n) => n >= 1),
      `zones ${range(day)}`,
    ),
  );

  const activeH = r.portalReachSec.active === null ? null : r.portalReachSec.active / SEC_PER_HOUR;
  const idleH = r.portalReachSec.idle === null ? null : r.portalReachSec.idle / SEC_PER_HOUR;
  out.push(
    ok(
      'P5',
      'Realm start → portal: 2–4h active, 8–16h idle',
      activeH !== null && idleH !== null && activeH >= 2 && activeH <= 4 && idleH >= 8 && idleH <= 16,
      `active ${activeH === null ? 'never' : activeH.toFixed(2) + 'h'}, idle ${idleH === null ? 'never' : idleH.toFixed(2) + 'h'}`,
    ),
  );

  // The band is in *active* minutes, so it is measured as the fight's length
  // at sustained momentum — the number the portal preview shows. Wall-clock
  // elapsed is longer for anyone who is not striking the whole time.
  const durations = r.realms
    .filter((x) => x.victorySec !== null && x.bossActiveEtaAtEntrySec !== null)
    .map((x) => x.bossActiveEtaAtEntrySec as number);
  const outOfBand = durations.filter((d) => d < BOSS_MIN_SEC || d > BOSS_MAX_SEC);
  out.push(
    ok(
      'P6',
      `Portal boss duration, prepared build: ${BOSS_MIN_SEC / 60}–${BOSS_MAX_SEC / 60} min active`,
      durations.length > 0 && outOfBand.length === 0,
      durations.length === 0
        ? 'no completed attempt'
        : `${durations.length - outOfBand.length}/${durations.length} realms in band: ` +
          durations.map((d) => fmtTime(d)).join(', '),
    ),
  );

  const pv = r.promptVsOverfarm;
  out.push(
    ok(
      'P7',
      'Ascending promptly beats farming a ready realm 2x longer',
      pv !== null && pv.promptBanked > pv.overfarmBanked,
      pv === null
        ? 'not measured'
        : `prompt ${pv.promptBanked.toFixed(1)} vs overfarm ${pv.overfarmBanked.toFixed(1)} Ascendancy at ${fmtTime(pv.horizonSec)}`,
    ),
  );

  // Three claims, because one number cannot carry this honestly.
  //
  // `priced` is the critic's actual complaint — five rows with prices on them,
  // always, whatever the wallet says. Gold cannot move it, so nothing can blip
  // it, and it is asserted on the strict minimum.
  //
  // `affordable` is what the player can act on, and it dips to zero for one
  // sample whenever the purchase loop has just spent everything. That is the
  // spend policy, not an empty shop, so it is asserted at 95% of looks rather
  // than on the minimum, with the starvation floor below catching a real drought.
  const sd = r.spendDepth;
  const richPct = sd.richFraction * 100;
  const pricedOk = sd.counted > 0 && sd.minPriced >= SPEND_PRICED_FLOOR;
  const richOk = sd.counted > 0 && sd.richFraction >= 0.95;
  // An all-greyed panel is the one state the shop may never render: the answer
  // to "what do I spend on next" cannot be "nothing". Staggered skill prices
  // are what hold this — the cheapest track is affordable long before the
  // dearest one is (docs/DECISIONS.md #33).
  const neverGreyOk = sd.counted > 0 && sd.minAffordable >= 1;
  const droughtOk =
    sd.counted > 0 &&
    sd.starvedFraction <= SPEND_MAX_STARVED_FRACTION &&
    sd.longestStarvedSec <= SPEND_MAX_DROUGHT_SEC;
  out.push(
    ok(
      'P8',
      `Upgrade panel: ≥${SPEND_PRICED_FLOOR} priced and ≥1 affordable always, ` +
        `≥${SPEND_TARGET} affordable at 95% of looks`,
      pricedOk && neverGreyOk && richOk && droughtOk,
      sd.counted === 0
        ? 'no samples'
        : `${sd.minPriced} priced and ${sd.minAffordable} affordable at the leanest look; ` +
          `≥${SPEND_TARGET} affordable at ${richPct.toFixed(1)}% of ${sd.counted} looks ` +
          `(worst realm ${sd.worstRealm}); ` +
          `under 2 affordable for ${(sd.starvedFraction * 100).toFixed(2)}% of looks, ` +
          `longest stretch ${fmtTime(sd.longestStarvedSec)}`,
    ),
  );

  // P6 measures the fight and cannot see the wait before it. The capped-tree
  // game parked the player on an open portal for 76 hours earning no
  // Ascendancy at all, with realm cadence degrading 1.0 -> 3.5 days, while P6
  // stayed green the whole time — the gate was hiding the damage in wait time.
  const dt = r.deadTime;
  const waitOk = dt.realms > 0 && dt.longestSec <= MAX_PORTAL_WAIT_SEC;
  const shareOk = dt.realms > 0 && dt.fraction <= MAX_PORTAL_WAIT_FRACTION;
  const cadenceOk = dt.realms > 0 && dt.slowestRealmDays <= MAX_REALM_DAYS;
  out.push(
    ok(
      'P9',
      `Portal-ready dead time ≤${MAX_PORTAL_WAIT_SEC / 3600}h, realm cadence ≤${MAX_REALM_DAYS}d`,
      waitOk && shareOk && cadenceOk,
      dt.realms === 0
        ? 'no completed realms'
        : `longest wait ${fmtTime(dt.longestSec)} (realm ${dt.worstRealm}), ` +
          `${(dt.fraction * 100).toFixed(0)}% of Road time waiting; ` +
          `slowest realm ${dt.slowestRealmDays.toFixed(2)}d (realm ${dt.slowestRealm}) ` +
          `over ${dt.realms} realms`,
    ),
  );

  // The band that replaces the gold multiplier: no rate on a temporary
  // currency beats a night of idle, because idle has all night. Ascendancy per
  // realm is bounded, so this is the comparison that actually separates them.
  const pu = r.permanentUplift;
  const sooner = (idle: number | null, active: number | null): number | null =>
    idle !== null && active !== null && active > 0 ? idle / active : null;
  const ascendSooner = pu ? sooner(pu.idleFirstAscensionSec, pu.activeFirstAscensionSec) : null;
  const rankSooner = pu ? sooner(pu.idleRankSec, pu.activeRankSec) : null;
  // The sooner-clause is horizon-free, so it is banded on every run however
  // short. The ratio decays with run length, so it is banded only once both
  // runs reach the checkpoint it was measured at — reported, never silently
  // judged against a bar it was not taken at (docs/DECISIONS.md #39).
  const soonerOk = ascendSooner !== null && ascendSooner >= PERMANENT_SOONER_MIN;
  const ratioOk =
    pu !== null &&
    (!pu.reachedHorizon ||
      (pu.ratio >= PERMANENT_RATIO_MIN && pu.ratio <= PERMANENT_RATIO_MAX));
  // Content end bounds the comparison: past it one side is frozen, so the
  // reading is capped there rather than extended (docs/DECISIONS.md #48).
  const endNote =
    pu === null || pu.contentEndRealm === null
      ? ''
      : ` [capped at content end — realm ${pu.contentEndRealm} at ${fmtTime(pu.contentEndSec)}]`;
  const ratioNote =
    pu === null
      ? ''
      : pu.reachedHorizon
        ? `${pu.ratio.toFixed(2)}x Ascendancy at ${fmtTime(pu.horizonSec)} ` +
          `(${pu.activeEarned.toFixed(0)} vs ${pu.idleEarned.toFixed(0)})${endNote}`
        : `Ascendancy ratio not banded — run reached ${fmtTime(pu.measuredAtSec)}, ` +
          `band is stated at ${fmtTime(pu.horizonSec)} (${pu.ratio.toFixed(2)}x so far)${endNote}`;
  out.push(
    ok(
      'P10',
      `Permanent power: ${PERMANENT_RATIO_MIN}–${PERMANENT_RATIO_MAX}x Ascendancy at ` +
        `${PERMANENT_HORIZON_SEC / SEC_PER_DAY}d, first ascension ≥${PERMANENT_SOONER_MIN}x sooner`,
      ratioOk && soonerOk,
      pu === null
        ? 'not measured'
        : `${ratioNote}; ` +
          `first ascension ${fmtTime(pu.activeFirstAscensionSec)} vs ${fmtTime(pu.idleFirstAscensionSec)}` +
          `${ascendSooner === null ? '' : ` (${ascendSooner.toFixed(2)}x sooner)`}; ` +
          `${pu.rankTarget} tree ranks ${fmtTime(pu.activeRankSec)} vs ${fmtTime(pu.idleRankSec)}` +
          `${rankSooner === null ? '' : ` (${rankSooner.toFixed(2)}x, reported not banded)`}`,
    ),
  );

  return out;
}
