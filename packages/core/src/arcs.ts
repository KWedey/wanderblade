// Loot-arc geometry. Arc space is scene-independent: the hero stands at the
// origin, x runs along the road, and an arc's apex is one unit high. The client
// maps this onto its own scene; it never decides a catch.

import {
  ARC_CATCH_PERP,
  ARC_CATCH_SEC,
  ARC_FLIGHT_SEC,
  ARC_MAX_REACH,
  ARC_MIN_REACH,
  ARC_SPLIT_MAX,
  ARC_SPLIT_MIN,
  ARC_STAGGER_SEC,
  COIN_SHARE_SPREAD,
} from './constants';
import type { ArcPoint, LootArc } from './types';

const GOLDEN_FRACTION = 0.618_033_988_749_894_9;
/** A second irrational, so a kill's coin count does not track its reach. */
const SPLIT_FRACTION = 0.414_213_562_373_095_1;
/** A third irrational, so a coin's worth tracks neither its reach nor its count. */
const COIN_FRACTION = 0.517_638_090_205_041_5;

/**
 * How large a share the coin at `index` takes, before normalising. Mean 1 over
 * the sequence, indexed like `arcLandingX` so it costs no RNG draw and a save
 * reconstructs it exactly.
 */
function coinWeight(index: number): number {
  const u = (index * COIN_FRACTION) % 1;
  return 1 - COIN_SHARE_SPREAD + 2 * COIN_SHARE_SPREAD * u;
}

/**
 * How far the arc thrown by `killIndex` flies. The golden ratio spreads
 * consecutive kills across the reach without an RNG draw, so arcs in flight
 * together are separable and the kill-indexed stream is untouched.
 */
export function arcLandingX(killIndex: number): number {
  const u = (killIndex * GOLDEN_FRACTION) % 1;
  return ARC_MIN_REACH + u * (ARC_MAX_REACH - ARC_MIN_REACH);
}

/** How many coins the kill at `killIndex` throws. */
export function arcSplitCount(killIndex: number): number {
  const span = ARC_SPLIT_MAX - ARC_SPLIT_MIN + 1;
  const u = (killIndex * SPLIT_FRACTION) % 1;
  const n = ARC_SPLIT_MIN + Math.floor(u * span);
  return n > ARC_SPLIT_MAX ? ARC_SPLIT_MAX : n;
}

/**
 * The arcs one kill throws. Coin values sum to `gold` exactly — the last coin
 * carries the residual rather than a rounded share, so no fraction of a payout
 * is created or lost by the split. Any gear rides the first coin; a drop cannot
 * be halved.
 */
export function arcsForKill(
  killIndex: number,
  gold: number,
  launchSec: number,
  gear: LootArc['gear'] = null,
): LootArc[] {
  const n = arcSplitCount(killIndex);
  const base = killIndex * ARC_SPLIT_MAX;
  let weightSum = 0;
  for (let i = 0; i < n; i++) weightSum += coinWeight(base + i);
  const out: LootArc[] = [];
  let credited = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const value = last ? gold - credited : gold * (coinWeight(base + i) / weightSum);
    credited += value;
    out.push({
      gold: value,
      expiresAtSec: launchSec + i * ARC_STAGGER_SEC + ARC_FLIGHT_SEC,
      landingX: arcLandingX(killIndex * ARC_SPLIT_MAX + i),
      gear: i === 0 ? gear : null,
    });
  }
  return out;
}

/** Where `arc` is at `atSec`, or null before launch and once it has landed. */
export function arcPositionAt(arc: LootArc, atSec: number): ArcPoint | null {
  // A save written before arcs had a reach leaves one uncatchable, never NaN.
  if (!Number.isFinite(arc.landingX)) return null;
  const p = 1 - (arc.expiresAtSec - atSec) / ARC_FLIGHT_SEC;
  if (!(p >= 0) || p >= 1) return null;
  return { x: arc.landingX * p, y: 4 * p * (1 - p) };
}

/**
 * How fast `arc` is travelling at `atSec`, in arc units per second. Zero once
 * the coin is down, which is also when it stops being catchable.
 */
export function arcSpeedAt(arc: LootArc, atSec: number): number {
  if (!Number.isFinite(arc.landingX)) return 0;
  const p = 1 - (arc.expiresAtSec - atSec) / ARC_FLIGHT_SEC;
  if (!(p >= 0) || p >= 1) return 0;
  const dy = 4 - 8 * p;
  return Math.sqrt(arc.landingX * arc.landingX + dy * dy) / ARC_FLIGHT_SEC;
}

/**
 * The catch radius for `arc` at `atSec`: `ARC_CATCH_SEC` of its own travel, so
 * the forgiveness a player gets is the same number of milliseconds anywhere
 * along the flight rather than collapsing near the ground.
 */
export function arcCatchRadius(arc: LootArc, atSec: number): number {
  return ARC_CATCH_SEC * arcSpeedAt(arc, atSec);
}

/** Unit vector along `arc`'s travel at `atSec`, or null once it is down. */
export function arcHeadingAt(arc: LootArc, atSec: number): ArcPoint | null {
  if (!Number.isFinite(arc.landingX)) return null;
  const p = 1 - (arc.expiresAtSec - atSec) / ARC_FLIGHT_SEC;
  if (!(p >= 0) || p >= 1) return null;
  const dx = arc.landingX / ARC_FLIGHT_SEC;
  const dy = (4 - 8 * p) / ARC_FLIGHT_SEC;
  const mag = Math.hypot(dx, dy);
  if (!(mag > 0)) return null;
  return { x: dx / mag, y: dy / mag };
}

/**
 * Index of the arc a strike landing on `aim` catches, or -1 for a clean miss.
 *
 * The window is an ellipse aligned to the coin's own travel: `ARC_CATCH_SEC` of
 * its flight along the path, `ARC_CATCH_PERP` across it. Being late is an error
 * along the path and is forgiven generously; aiming at the wrong place is an
 * error across it and is not. Scored as a fraction of each coin's own window,
 * so the coin the strike is most clearly inside wins; a tie goes to the older.
 */
export function arcHitIndex(
  arcs: readonly LootArc[],
  aim: ArcPoint,
  atSec: number,
): number {
  let best = -1;
  let bestScore = 1;
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i];
    if (!arc) continue;
    const p = arcPositionAt(arc, atSec);
    if (!p) continue;
    const along = arcCatchRadius(arc, atSec);
    if (!(along > 0)) continue;
    const u = arcHeadingAt(arc, atSec);
    if (!u) continue;
    const dx = p.x - aim.x;
    const dy = p.y - aim.y;
    const l = dx * u.x + dy * u.y;
    const q = dy * u.x - dx * u.y;
    const score = (l * l) / (along * along) + (q * q) / (ARC_CATCH_PERP * ARC_CATCH_PERP);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
