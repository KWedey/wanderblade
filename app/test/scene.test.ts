import { describe, expect, it } from 'vitest';

import { lightnessOf, MIN_HILL_SHADOW_GAP } from '../src/scene/palette';
import { drawHills, type FillCtx } from '../src/scene/scene';

/** Records what drawHills actually paints — a pure-geometry test alone can pass while the loop that draws it stays broken. */
function fakeCtx(): { ctx: FillCtx; calls: Array<{ style: string; x: number; y: number; w: number; h: number }> } {
  const calls: Array<{ style: string; x: number; y: number; w: number; h: number }> = [];
  const ctx: FillCtx = {
    fillStyle: '#000000',
    fillRect(x, y, w, h) {
      calls.push({ style: ctx.fillStyle as string, x, y, w, h });
    },
  };
  return { ctx, calls };
}

describe('drawHills paints a filled, sloped silhouette, not a staircase or a floating shadow', () => {
  const vw = 400;
  const groundY = 550;
  const baseH = 180;
  const stepPx = 4;
  const haze = '#221a1a';
  const columns = Math.ceil(vw / stepPx);

  // drawHills fills exactly 3 rects per column, in order: main band, base band, cap.
  function run() {
    const { ctx, calls } = fakeCtx();
    drawHills(ctx, vw, groundY, '#3a6b4f', null, 0, 70, baseH, 1, stepPx, haze);
    return calls;
  }

  it('fills every column with a main band, a base band, and a cap — three rects per step', () => {
    const calls = run();
    expect(calls.length).toBe(columns * 3);
    for (let i = 0; i < columns; i++) expect(calls[i * 3]!.h, `column ${i} main band`).toBeGreaterThan(0);
  });

  it('never lets the base band land at or below the haze it must clear', () => {
    const calls = run();
    for (let i = 0; i < columns; i++) {
      const base = calls[i * 3 + 1]!;
      expect(lightnessOf(base.style) - lightnessOf(haze), `column ${i} base band`).toBeGreaterThanOrEqual(
        MIN_HILL_SHADOW_GAP - 1e-9,
      );
    }
  });

  it('never lets an adjacent column jump further than the clamp allows', () => {
    const calls = run();
    const maxDelta = stepPx * 1.5;
    for (let i = 1; i < columns; i++) {
      const delta = Math.abs(calls[i * 3]!.h - calls[(i - 1) * 3]!.h);
      expect(delta, `column ${i}`).toBeLessThanOrEqual(maxDelta);
    }
  });
});
