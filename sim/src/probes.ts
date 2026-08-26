// Controlled A/B experiments. Each probe clones one mid-run state and runs the
// two policies from identical inputs, so the measured ratio is caused by the
// player's input and nothing else.

import {
  abandonBoss,
  advance,
  bossEtaSec,
  enterPortal,
  ascSpent,
  gearPower,
  GEAR_SLOTS,
  type GameState,
} from '@wanderblade/core';
import { botTouch } from './bot';
import { CAP_RATE, SEC_PER_HOUR, strikeThrough } from './policy';
import { clone, runPlayer, timeToKill, type RunOptions } from './simulate';
import type { ShopSample, SimConfig, SpendDepth, Uplift } from './types';

const ROAD_WINDOW_SEC = 20 * 60;
/** Guardians are allowed a long time to fall before a probe gives up. */
const BOSS_PROBE_CAP_SEC = 30 * 86_400;

/**
 * Pin the build and the road position: an open portal stops zone advance, and
 * a best-in-zone epic in every slot means no drop can improve on what is worn.
 */
function freeze(s: GameState): GameState {
  s.portalReady = true;
  const power = gearPower(s.realm, s.zone, 'epic');
  for (const slot of GEAR_SLOTS) {
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
    let left = 8 * SEC_PER_HOUR;
    while (left > 1e-9) {
      const dt = Math.min(300, left);
      advance(s, dt);
      left -= dt;
    }
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
    let left = 24 * SEC_PER_HOUR;
    while (left > 1e-9) {
      const dt = Math.min(300, left);
      advance(s, dt);
      left -= dt;
    }
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
  const earned = (s: GameState): number =>
    s.ascendancy.banked + s.ascendancy.pending + ascSpent(s.ascendancy);
  return {
    promptBanked: earned(prompt.state),
    overfarmBanked: earned(over.state),
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
    const dt = Math.min(300, left);
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
    const dt = Math.min(300, left);
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
