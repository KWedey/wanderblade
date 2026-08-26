import { describe, expect, it } from 'vitest';

import { GLYPH_H, textWidth } from '../src/scene/pixels';
import {
  boxesOverlap,
  COMBO_LANE,
  FLOATER_RISE,
  laneBaseline,
  laneLifeBox,
  LANE_COUNT,
  LANE_STEP,
  placeRun,
  spansCollide,
  type LaneSpan,
} from '../src/scene/textlane';

const GROUND_Y = 200;

describe('boxesOverlap', () => {
  const base = { x: 0, y: 0, w: 10, h: 10 };

  it('detects a shared region', () => {
    expect(boxesOverlap(base, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('is false for boxes that only touch', () => {
    expect(boxesOverlap(base, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(boxesOverlap(base, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
  });

  it('honours the pad', () => {
    expect(boxesOverlap(base, { x: 12, y: 0, w: 10, h: 10 })).toBe(false);
    expect(boxesOverlap(base, { x: 12, y: 0, w: 10, h: 10 }, 4)).toBe(true);
  });
});

describe('spansCollide', () => {
  it('only cares about horizontal extent', () => {
    const a: LaneSpan = { x: 0, w: 20, lane: 0 };
    expect(spansCollide(a, { x: 10, w: 20, lane: 9 }, 0)).toBe(true);
    expect(spansCollide(a, { x: 25, w: 20, lane: 0 }, 0)).toBe(false);
    expect(spansCollide(a, { x: 25, w: 20, lane: 0 }, 8)).toBe(true);
  });
});

describe('placeRun', () => {
  it('takes the preferred lane when it is free, evicting nothing', () => {
    expect(placeRun(0, 20, [], LANE_COUNT, 3, 1)).toEqual({ lane: 1, evict: [] });
    expect(placeRun(0, 20, [], LANE_COUNT, 3, 2)).toEqual({ lane: 2, evict: [] });
  });

  it('steps to a neighbour when the preferred lane is occupied', () => {
    const taken: LaneSpan[] = [{ x: 0, w: 20, lane: 1 }];
    const placed = placeRun(5, 20, taken, LANE_COUNT, 3, 1);
    expect(placed.lane).not.toBe(1);
    expect(placed.evict).toEqual([]);
  });

  it('ignores occupants that do not overlap horizontally', () => {
    const taken: LaneSpan[] = [{ x: 400, w: 20, lane: 0 }];
    expect(placeRun(0, 20, taken, LANE_COUNT, 3, 0)).toEqual({ lane: 0, evict: [] });
  });

  it('clamps a preferred lane outside the range', () => {
    expect(placeRun(0, 20, [], LANE_COUNT, 3, -5).lane).toBe(0);
    expect(placeRun(0, 20, [], LANE_COUNT, 3, 99).lane).toBe(LANE_COUNT - 1);
  });

  it('evicts the least crowded lane rather than stacking on it', () => {
    const taken: LaneSpan[] = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      taken.push({ x: 0, w: 40, lane });
      if (lane > 0) taken.push({ x: 0, w: 40, lane });
    }
    const placed = placeRun(0, 40, taken, LANE_COUNT, 3, 2);
    expect(placed.lane).toBe(0);
    expect(placed.evict.length).toBe(1);
    expect(taken[placed.evict[0]!]!.lane).toBe(0);
  });
});

// The bug this guards: a judged frame rendered "(COMBO: x2:N1US" - a CAUGHT
// BONUS floater rising onto the combo label 21px above its spawn point.
describe('lane geometry makes overlap impossible', () => {
  it('separates lanes by more than a glyph plus its whole drift', () => {
    expect(LANE_STEP).toBeGreaterThanOrEqual(FLOATER_RISE + GLYPH_H);
  });

  it('leaves no life-box of one lane touching the next', () => {
    for (let lane = 0; lane + 1 < LANE_COUNT; lane++) {
      const lower = laneLifeBox(lane, GROUND_Y, 0, 60);
      const upper = laneLifeBox(lane + 1, GROUND_Y, 0, 60);
      expect(boxesOverlap(lower, upper), `lanes ${lane}/${lane + 1}`).toBe(false);
    }
  });

  it('stacks lanes upward from the ground line', () => {
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      expect(laneBaseline(lane, GROUND_Y)).toBeLessThan(laneBaseline(lane - 1, GROUND_Y));
    }
  });

  // Replays the scene's own allocator over a burst of overlapping spawns and
  // samples every pair across every moment of their lives.
  it('never lets two live runs share a pixel', () => {
    const texts = ['+8.94cr', 'CAUGHT BONUS', '1.2K', '×2.1', '447', '+12.0M', '9'];
    const live: { span: LaneSpan; text: string }[] = [];
    let collisions = 0;

    for (let i = 0; i < 400; i++) {
      const text = texts[i % texts.length]!;
      const w = textWidth(text, 1);
      // Cluster spawns tightly, which is exactly when the bug showed up.
      const x = 90 + ((i * 7) % 40);
      const taken = live.map((f) => f.span);
      const { lane, evict } = placeRun(x, w, taken, LANE_COUNT, 3, i % LANE_COUNT);
      for (const index of [...evict].sort((a, b) => b - a)) live.splice(index, 1);
      const span: LaneSpan = { x, w, lane };

      for (const other of live) {
        const a = laneLifeBox(span.lane, GROUND_Y, span.x, span.w);
        const b = laneLifeBox(other.span.lane, GROUND_Y, other.span.x, other.span.w);
        if (boxesOverlap(a, b)) collisions++;
      }

      live.push({ span, text });
      if (live.length > LANE_COUNT) live.shift();
    }

    expect(collisions).toBe(0);
  });

  it('keeps the combo widget in its own lane above every floater lane', () => {
    expect(COMBO_LANE).toBe(LANE_COUNT - 1);
    const combo = laneLifeBox(COMBO_LANE, GROUND_Y, 0, 60);
    for (let lane = 0; lane < COMBO_LANE; lane++) {
      expect(boxesOverlap(combo, laneLifeBox(lane, GROUND_Y, 0, 60)), `lane ${lane}`).toBe(false);
    }
  });

  it('routes a floater away from the combo widget it would have hit', () => {
    const combo: LaneSpan = { x: 100, w: 50, lane: COMBO_LANE };
    const placed = placeRun(105, 40, [combo], LANE_COUNT, 3, COMBO_LANE);
    expect(placed.lane).not.toBe(COMBO_LANE);
    expect(placed.evict).toEqual([]);
  });
});
