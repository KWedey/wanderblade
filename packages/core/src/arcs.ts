// Loot-arc geometry. Arc space is scene-independent: the hero stands at the
// origin, x runs along the road, and an arc's apex is one unit high. The client
// maps this onto its own scene; it never decides a catch.

import {
  ARC_CATCH_RADIUS,
  ARC_FLIGHT_SEC,
  ARC_MAX_REACH,
  ARC_MIN_REACH,
  ARC_SPLIT_MAX,
  ARC_SPLIT_MIN,
  ARC_STAGGER_SEC,
} from './constants';
import type { ArcPoint, LootArc } from './types';

const GOLDEN_FRACTION = 0.618_033_988_749_894_9;
/** A second irrational, so a kill's coin count does not track its reach. */
const SPLIT_FRACTION = 0.414_213_562_373_095_1;

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
  const share = gold / n;
  const out: LootArc[] = [];
  let credited = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const value = last ? gold - credited : share;
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
 * Index of the arc a strike landing on `aim` catches, or -1 for a clean miss.
 * Nearest inside `ARC_CATCH_RADIUS` wins; an exact tie goes to the older arc.
 */
export function arcHitIndex(
  arcs: readonly LootArc[],
  aim: ArcPoint,
  atSec: number,
): number {
  let best = -1;
  let bestDistSq = ARC_CATCH_RADIUS * ARC_CATCH_RADIUS;
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i];
    if (!arc) continue;
    const p = arcPositionAt(arc, atSec);
    if (!p) continue;
    const dx = p.x - aim.x;
    const dy = p.y - aim.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = i;
    }
  }
  return best;
}
