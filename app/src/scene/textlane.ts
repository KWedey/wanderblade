// Keeps in-world text off other in-world text. Lanes are assigned once and
// every floater rises by the same amount, because two runs spaced only at
// spawn still converge when they rise at different rates.

import { NUMERAL_FONT } from './pixels';

/**
 * Text-lane geometry. Every run of in-world text snaps to this grid and drifts
 * by the same FLOATER_RISE, so LANE_STEP >= FLOATER_RISE + FLOATER_GLYPH_H
 * makes two runs in different lanes unable to share a pixel however they are
 * timed. The cell is the numeral face's, because that is what floaters are
 * drawn in; a widget or bar taller than one lane reserves every lane it
 * touches through lanesTouching instead of assuming one.
 */
export const FLOATER_GLYPH_H = NUMERAL_FONT.h;
export const FLOATER_RISE = 6;
export const LANE_STEP = FLOATER_GLYPH_H + FLOATER_RISE + 1;
export const LANE_COUNT = 3;
/** Lane 0 sits this far above the ground line, clear of the tallest monster. */
export const LANE_BASE_OFFSET = 30;
/** The combo widget owns the top lane over the hero's column. */
export const COMBO_LANE = LANE_COUNT - 1;

/** Baseline y of a lane, measured down from the scene's ground line. */
export function laneBaseline(lane: number, groundY: number): number {
  return groundY - LANE_BASE_OFFSET - lane * LANE_STEP;
}

/** The band a run in `lane` can occupy at any point in its life. */
export function laneLifeBox(lane: number, groundY: number, x: number, w: number): TextBox {
  const baseline = laneBaseline(lane, groundY);
  return { x, y: baseline - FLOATER_RISE, w, h: FLOATER_GLYPH_H + FLOATER_RISE };
}

export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned overlap, with `pad` empty pixels demanded on every side. */
export function boxesOverlap(a: TextBox, b: TextBox, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad &&
    b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad &&
    b.y < a.y + a.h + pad
  );
}

export interface LaneSpan {
  /** Left edge of the text run. */
  x: number;
  w: number;
  lane: number;
}

/** True when two spans share horizontal extent and so cannot share a lane. */
export function spansCollide(a: LaneSpan, b: LaneSpan, pad: number): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad;
}

/**
 * Lanes whose life-box overlaps `top`..`bottom`. A health bar hugs its monster
 * rather than sitting on the grid, so it can straddle two lanes and has to
 * reserve both.
 */
export function lanesTouching(
  top: number,
  bottom: number,
  groundY: number,
  laneCount: number,
): number[] {
  const out: number[] = [];
  for (let lane = 0; lane < laneCount; lane++) {
    const box = laneLifeBox(lane, groundY, 0, 1);
    if (top < box.y + box.h && box.y < bottom) out.push(lane);
  }
  return out;
}

export interface Placement {
  lane: number;
  /** Indices into `taken` that must go, so the lane is the winner's alone. */
  evict: number[];
}

/**
 * Nearest free lane to `preferred`, searched outward. With every lane
 * contested the newest run still gets a clean lane and evicts what it lands
 * on: stacking shipped overlapping glyphs, dropping reads as a missed hit.
 */
export function placeRun(
  x: number,
  w: number,
  taken: readonly LaneSpan[],
  laneCount: number,
  pad = 3,
  preferred = 0,
  evictableBelow = taken.length,
): Placement {
  const incoming: LaneSpan = { x, w, lane: 0 };
  const hits: number[][] = Array.from({ length: laneCount }, () => []);
  const pinned: number[] = new Array<number>(laneCount).fill(0);
  taken.forEach((span, index) => {
    if (span.lane < 0 || span.lane >= laneCount) return;
    if (!spansCollide(incoming, span, pad)) return;
    if (index < evictableBelow) hits[span.lane]!.push(index);
    else pinned[span.lane]! += 1;
  });

  // A widget or a health bar cannot be evicted, so a lane holding one is the
  // last resort however few runs are also in it.
  const cost = (lane: number): number => pinned[lane]! * 64 + hits[lane]!.length;
  const start = Math.max(0, Math.min(laneCount - 1, Math.round(preferred)));
  let best = start;
  for (let radius = 0; radius < laneCount; radius++) {
    for (const lane of radius === 0 ? [start] : [start + radius, start - radius]) {
      if (lane < 0 || lane >= laneCount) continue;
      if (cost(lane) === 0) return { lane, evict: [] };
      if (cost(lane) < cost(best)) best = lane;
    }
  }
  return { lane: best, evict: hits[best]! };
}
