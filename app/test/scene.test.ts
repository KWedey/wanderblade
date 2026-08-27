import { describe, expect, it } from 'vitest';

import { lightnessOf, mixHex, MIN_HILL_SHADOW_GAP, torchGlowBands } from '../src/scene/palette';
import {
  drawGroundBands,
  drawHills,
  drawPillars,
  drawStoneWall,
  drawTorchFlame,
  drawTorchGlow,
  drawVignette,
  type FillCtx,
  type TorchLight,
} from '../src/scene/scene';

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

describe('drawGroundBands paints the turf as stacked flat strips, not one solid rect', () => {
  it('fills one rect per tone, stacked top to bottom with no gap or overlap', () => {
    const { ctx, calls } = fakeCtx();
    const tones = ['#111111', '#222222', '#333333', '#3a6b4f'];
    drawGroundBands(ctx, 400, 500, 24, tones);
    expect(calls.length).toBe(tones.length);
    expect(calls[0]!.y).toBe(500);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]!.y, `band ${i} start`).toBe(calls[i - 1]!.y + calls[i - 1]!.h);
      expect(calls[i]!.style, `band ${i} tone`).toBe(tones[i]);
    }
    const last = calls[calls.length - 1]!;
    expect(last.y + last.h).toBe(524);
  });

  it('covers the full width on every band', () => {
    const { ctx, calls } = fakeCtx();
    drawGroundBands(ctx, 400, 500, 20, ['#111111', '#222222']);
    for (const call of calls) expect(call.w).toBe(400);
  });
});

describe('drawStoneWall paints coursed masonry, not a single flat panel', () => {
  const vw = 300;
  const top = 20;
  const bottom = 100;
  const brickH = 7;
  const tones = ['#111111', '#222222', '#3a3a3a'];
  const jointTone = '#0a0a0a';

  function run() {
    const { ctx, calls } = fakeCtx();
    drawStoneWall(ctx, 0, vw, top, bottom, tones, jointTone, brickH);
    return calls;
  }

  it('fills every course full-width, stacked top to bottom with no gap or overlap', () => {
    const calls = run();
    const courses = calls.filter((c) => c.w === vw);
    expect(courses.length).toBeGreaterThan(1);
    expect(courses[0]!.y).toBe(top);
    for (let i = 1; i < courses.length; i++) {
      expect(courses[i]!.y, `course ${i} start`).toBe(courses[i - 1]!.y + courses[i - 1]!.h);
    }
    const last = courses[courses.length - 1]!;
    expect(last.y + last.h).toBe(bottom);
  });

  it('stamps mortar joints as narrow rects that stagger between adjacent courses', () => {
    const calls = run();
    const joints = calls.filter((c) => c.w === 1);
    expect(joints.length).toBeGreaterThan(0);
    for (const j of joints) expect(j.style).toBe(jointTone);
    const rowsOfJoints = new Map<number, number[]>();
    for (const j of joints) rowsOfJoints.set(j.y, [...(rowsOfJoints.get(j.y) ?? []), j.x]);
    const rowYs = [...rowsOfJoints.keys()].sort((a, b) => a - b);
    expect(rowsOfJoints.get(rowYs[0]!)).not.toEqual(rowsOfJoints.get(rowYs[1]!));
  });
});

describe('drawVignette darkens the frame in discrete, non-overlapping rings', () => {
  const vw = 300;
  const vh = 200;
  const step = 3;
  const tones = ['#000000', '#222222', '#444444', '#666666'];

  function run() {
    const { ctx, calls } = fakeCtx();
    drawVignette(ctx, vw, vh, tones, step);
    return calls;
  }

  it('paints four border strips per ring — top, bottom, left, right — never a filled gradient', () => {
    const calls = run();
    expect(calls.length).toBe(tones.length * 4);
  });

  it('nests each ring one step further in, darkest tone at the true screen edge', () => {
    const calls = run();
    for (let i = 0; i < tones.length; i++) {
      const top = calls[i * 4]!;
      expect(top.style).toBe(tones[i]);
      expect(top.x).toBe(i * step);
      expect(top.y).toBe(i * step);
    }
  });

  it('never lets two rings claim the same row of the top strip', () => {
    const calls = run();
    const topStrips = calls.filter((_, idx) => idx % 4 === 0);
    for (let i = 1; i < topStrips.length; i++) {
      expect(topStrips[i]!.y).toBeGreaterThan(topStrips[i - 1]!.y);
    }
  });
});

describe('drawPillars paints two coursed piers with a lit inner edge facing the fight', () => {
  const top = 20;
  const bottom = 100;
  const tones = ['#111111', '#222222', '#3a3a3a'];
  const jointTone = '#0a0a0a';
  const edgeColor = '#ffdd88';
  const edgeW = 3;
  const brickH = 7;
  const spans = [
    { x: 0, w: 40 },
    { x: 360, w: 40 },
  ];

  function run() {
    const { ctx, calls } = fakeCtx();
    drawPillars(ctx, spans, top, bottom, tones, jointTone, edgeColor, edgeW, brickH);
    return calls;
  }

  it('courses each pier independently, confined to its own span', () => {
    const calls = run();
    const courses = calls.filter((c) => tones.includes(c.style));
    for (const c of courses) {
      const inLeft = c.x >= spans[0]!.x && c.x + c.w <= spans[0]!.x + spans[0]!.w;
      const inRight = c.x >= spans[1]!.x && c.x + c.w <= spans[1]!.x + spans[1]!.w;
      expect(inLeft || inRight, `course rect at x=${c.x} w=${c.w} stays inside one pier`).toBe(true);
    }
  });

  it('puts the lit edge on the side facing the open floor between the piers', () => {
    const calls = run();
    const edges = calls.filter((c) => c.style === edgeColor);
    expect(edges).toHaveLength(2);
    expect(edges[0]!.x).toBe(spans[0]!.x + spans[0]!.w - edgeW);
    expect(edges[1]!.x).toBe(spans[1]!.x);
  });
});

describe('drawTorchGlow lights the stone under a torch in discrete bands, not a hollow ring', () => {
  const baseTone = '#202020';
  const flame = '#df7126';
  const reach = 40;
  const torch: TorchLight = { x: 100, y: 50, flicker: 1 };

  function run() {
    const { ctx, calls } = fakeCtx();
    drawTorchGlow(ctx, [torch], baseTone, flame, reach);
    return calls;
  }

  it('paints a filled center row per band, spanning the full band width', () => {
    const calls = run();
    const bands = torchGlowBands(reach);
    const centerRows = calls.filter((c) => c.y === torch.y);
    expect(centerRows).toHaveLength(bands.length);
    bands.forEach((band, i) => {
      expect(centerRows[i]!.w, `band ${i} center width`).toBe(band.r * 2 + 1);
      expect(centerRows[i]!.style).toBe(mixHex(baseTone, flame, band.mix));
    });
  });

  it('leaves stone directly under the torch measurably warmer than stone at the edge of its reach', () => {
    const calls = run();
    const centerRows = calls.filter((c) => c.y === torch.y);
    const outermost = centerRows[0]!; // widest band, drawn first, least mixed toward flame
    const innermost = centerRows.at(-1)!; // narrowest band, drawn last, wins at the torch itself
    expect(lightnessOf(innermost.style)).toBeGreaterThan(lightnessOf(outermost.style));
  });

  it('never spreads light past the widest band radius', () => {
    const calls = run();
    const maxR = torchGlowBands(reach)[0]!.r;
    for (const c of calls) {
      expect(c.x).toBeGreaterThanOrEqual(torch.x - maxR);
      expect(c.x + c.w).toBeLessThanOrEqual(torch.x + maxR + 1);
    }
  });
});

describe('drawTorchFlame paints a filled core, not the hollow ring the sun halo once shipped (DECISIONS.md #53)', () => {
  it('fills every row of both the outer and inner disc, not just their circumference', () => {
    const { ctx, calls } = fakeCtx();
    drawTorchFlame(ctx, 50, 50, 1, '#df7126');
    const outer = calls.filter((c) => c.style === mixHex('#df7126', '#000000', 0.3));
    const inner = calls.filter((c) => c.style === mixHex('#df7126', '#ffffff', 0.35));
    expect(outer).toHaveLength(2 * 6 + 1);
    expect(inner).toHaveLength(2 * 3 + 1);
    for (const row of [...outer, ...inner]) expect(row.w).toBeGreaterThan(0);
  });
});
