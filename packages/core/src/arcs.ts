// Loot-arc geometry. Arc space is scene-independent: the hero stands at the
// origin, x runs along the road, and an arc's apex is one unit high. The client
// maps this onto its own scene; it never decides a catch.

import { ARC_CATCH_RADIUS, ARC_FLIGHT_SEC, ARC_MAX_REACH, ARC_MIN_REACH } from './constants';
import type { ArcPoint, LootArc } from './types';

const GOLDEN_FRACTION = 0.618_033_988_749_894_9;

/**
 * How far the arc thrown by `killIndex` flies. The golden ratio spreads
 * consecutive kills across the reach without an RNG draw, so arcs in flight
 * together are separable and the kill-indexed stream is untouched.
 */
export function arcLandingX(killIndex: number): number {
  const u = (killIndex * GOLDEN_FRACTION) % 1;
  return ARC_MIN_REACH + u * (ARC_MAX_REACH - ARC_MIN_REACH);
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
