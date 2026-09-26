import { describe, expect, it } from 'vitest';

import type { Frame, SceneModel, SceneSprites, SkinnedSprites } from '../src/scene/frame';
import { createViewport, type Viewport } from '../src/scene/geometry';
import { drawMomentumMeter } from '../src/scene/overlay';
import { OUTLINE_INK, lightnessOf, mixHex, realmSkin } from '../src/scene/palette';
import { NUMERAL_FONT } from '../src/scene/pixels';
import { drawFence, drawShadow } from '../src/scene/road';
import type { BakedSprite } from '../src/scene/sprites';
import { createWorld } from '../src/scene/world';
import { sceneModel } from './scene-model';

interface Call {
  op: 'fillRect' | 'drawImage';
  style: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Records fills and blits; every other context method is a no-op, so a draw function runs without a canvas. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state = { fillStyle: '#000000', globalAlpha: 1 };
  const noop = () => {};
  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: 'fillRect', style: state.fillStyle, x, y, w, h });
    },
    drawImage(_img: unknown, x: number, y: number, w: number, h: number) {
      calls.push({ op: 'drawImage', style: state.fillStyle, x, y, w, h });
    },
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    clearRect: noop,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function fakeSprite(width: number, height: number): BakedSprite {
  const image = {} as HTMLCanvasElement;
  return { image, flash: image, width, height, mass: { top: 0, width } };
}

function fakeSkinned(): SkinnedSprites {
  const one = fakeSprite(8, 10);
  return {
    monsters: [one],
    trees: [one],
    fernNear: one,
    tuftNear: one,
    rock: one,
    fence: fakeSprite(5, 9),
    tuft: one,
    flower: one,
    fern: one,
    birds: [one],
  };
}

function frame(over: { model?: Partial<SceneModel>; view?: Partial<Viewport> } = {}): { f: Frame; calls: Call[] } {
  const { ctx, calls } = recordingCtx();
  const view = { ...createViewport(), vw: 300, vh: 170, groundY: 120, sceneBottomY: 170, worldRightX: 200, heroX: 72, ...over.view };
  const m = sceneModel(over.model);
  const sprites: SceneSprites = {
    heroA: fakeSprite(14, 22),
    heroB: fakeSprite(14, 22),
    sword: fakeSprite(26, 5),
    coin: fakeSprite(6, 6),
    gem: fakeSprite(6, 6),
    skinned: fakeSkinned(),
  };
  const f: Frame = {
    ctx,
    view,
    model: m,
    skin: realmSkin(m.region),
    sprites,
    world: createWorld(),
    ground: { blades: [], fringe: [], strata: [] },
  };
  return { f, calls };
}

describe('drawShadow paints a hard four-row contact shadow pooled toward the off-sun side', () => {
  it('lays four one-pixel rows directly under the horizon lip, each narrower than the last', () => {
    const { f, calls } = frame();
    drawShadow(f, 100, 20);
    expect(calls).toHaveLength(4);
    calls.forEach((c, i) => {
      expect(c.op).toBe('fillRect');
      expect(c.y, `row ${i}`).toBe(f.view.groundY + 1 + i);
      expect(c.h).toBe(1);
    });
    expect(calls.map((c) => c.w)).toEqual([23, 20, 14, 8]);
  });

  it('centres every row left of the feet, where the upper-right sun casts it', () => {
    const { f, calls } = frame();
    drawShadow(f, 100, 20);
    const cx = 100 - Math.round(20 * 0.16);
    for (const c of calls) expect(c.x).toBe(Math.floor(cx - c.w / 2));
  });

  it('steps the realm turf toward night: a darker core over a lighter edge, never flat black', () => {
    const { f, calls } = frame();
    drawShadow(f, 100, 20, 0.52);
    const core = mixHex(f.skin.turf, '#1a1c2c', 0.52);
    const edge = mixHex(f.skin.turf, '#1a1c2c', 0.52 * 0.58);
    expect(calls.map((c) => c.style)).toEqual([core, core, edge, edge]);
    expect(lightnessOf(core)).toBeLessThan(lightnessOf(edge));
    expect(lightnessOf(edge)).toBeLessThan(lightnessOf(f.skin.turf));
  });

  it('casts on stone, not turf, once the fight is inside the dungeon', () => {
    const { f, calls } = frame({ model: { boss: true } });
    drawShadow(f, 100, 20, 0.52);
    expect(calls[0]!.style).toBe(mixHex(f.skin.rock, '#1a1c2c', 0.52));
    expect(calls[0]!.style).not.toBe(mixHex(f.skin.turf, '#1a1c2c', 0.52));
  });

  it('never lets a narrow actor lose its shadow: rows floor at two pixels wide', () => {
    const { f, calls } = frame();
    drawShadow(f, 100, 2);
    for (const c of calls) expect(c.w).toBeGreaterThanOrEqual(2);
  });
});

describe('drawFence marches posts at a fixed pitch with two continuous rails between them', () => {
  const pitch = 74;

  it('draws one post per pitch across the whole width plus a post either side, each on its own shadow', () => {
    const { f, calls } = frame();
    drawFence(f);
    const posts = calls.filter((c) => c.op === 'drawImage');
    const expected = Math.ceil((f.view.vw + 2 * pitch) / pitch);
    expect(posts).toHaveLength(expected);
    for (let i = 1; i < posts.length; i++) expect(posts[i]!.x - posts[i - 1]!.x).toBe(pitch);
    // Four shadow rows land before every post image.
    for (const post of posts) {
      const at = calls.indexOf(post);
      const shadow = calls.slice(at - 4, at);
      expect(shadow.map((c) => c.y)).toEqual([121, 122, 123, 124]);
    }
  });

  it('lays two rails per span, each exactly one pitch long so adjacent spans meet without a gap', () => {
    const { f, calls } = frame();
    drawFence(f);
    const railY = f.view.groundY - 8;
    const rails = calls.filter((c) => c.op === 'fillRect' && c.w === pitch);
    expect(rails.length).toBe(2 * Math.ceil((f.view.vw + 2 * pitch) / pitch));
    for (const r of rails) {
      expect(r.w).toBe(pitch);
      expect(r.h).toBe(1);
      expect([railY, railY + 4]).toContain(r.y);
    }
    const upper = rails.filter((r) => r.y === railY).sort((a, b) => a.x - b.x);
    for (let i = 1; i < upper.length; i++) expect(upper[i]!.x).toBe(upper[i - 1]!.x + upper[i - 1]!.w);
  });

  it('paints every rail in bark, not in whatever tone the shadow before it left behind', () => {
    const { f, calls } = frame();
    drawFence(f);
    const rails = calls.filter((c) => c.op === 'fillRect' && c.w === pitch);
    expect(rails.length).toBeGreaterThan(2);
    for (const r of rails) expect(r.style).toBe(f.skin.bark);
  });

  it('slides every post and rail by the ground scroll, so the fence moves with the road', () => {
    const still = frame();
    drawFence(still.f);
    const moved = frame();
    moved.f.world.scrollGround = 10;
    drawFence(moved.f);
    const xs = (calls: Call[]) => calls.map((c) => c.x);
    expect(xs(moved.calls)).toEqual(xs(still.calls).map((x) => x - 10));
  });
});

describe('drawMomentumMeter is a widget in the upper-left gutter, hidden at rest', () => {
  const segs = 6;
  const meterW = segs * 3 - 1;

  function cells(calls: Call[]): Call[] {
    return calls.slice(-segs);
  }

  it('paints nothing while momentum is at rest', () => {
    const { f, calls } = frame();
    f.world.heldMomentum = { value: 0.02, holdLeftSec: 0 };
    drawMomentumMeter(f);
    expect(calls).toHaveLength(0);
  });

  it('frames six two-pixel cells in the outline ink and lights as many as momentum has filled', () => {
    const { f, calls } = frame();
    f.world.heldMomentum = { value: 0.5, holdLeftSec: 0 };
    f.world.heldMult = { value: 1.37, holdLeftSec: 0 };
    drawMomentumMeter(f);
    const ring = calls[calls.length - segs - 1]!;
    expect(ring.style).toBe(OUTLINE_INK);
    expect(ring.w).toBe(meterW + 2);
    expect(ring.h).toBe(NUMERAL_FONT.h + 2);
    const pips = cells(calls);
    pips.forEach((c, i) => {
      expect(c.w).toBe(2);
      expect(c.h).toBe(NUMERAL_FONT.h);
      expect(c.x).toBe(pips[0]!.x + i * 3);
    });
    expect(pips.map((c) => c.style)).toEqual([
      f.skin.accent,
      f.skin.accent,
      f.skin.accent,
      '#3d3846',
      '#3d3846',
      '#3d3846',
    ]);
  });

  it('turns the label and the top two cells white once the combo runs hot', () => {
    const { f, calls } = frame();
    f.world.heldMomentum = { value: 1, holdLeftSec: 0 };
    f.world.heldMult = { value: 1.75, holdLeftSec: 0 };
    drawMomentumMeter(f);
    const pips = cells(calls);
    expect(pips.map((c) => c.style)).toEqual([
      f.skin.accent,
      f.skin.accent,
      f.skin.accent,
      f.skin.accent,
      '#ffffff',
      '#ffffff',
    ]);
    const label = calls.slice(0, calls.length - segs - 1);
    expect(label.some((c) => c.style === '#ffffff')).toBe(true);
    expect(label.some((c) => c.style === f.skin.accent)).toBe(false);
  });

  it('chases one tinted cell across an empty track, and holds still under reduce-motion', () => {
    const live = frame();
    live.f.world.heldMomentum = { value: 0.05, holdLeftSec: 0 };
    live.f.world.clockSec = 0.5;
    drawMomentumMeter(live.f);
    const idle = mixHex('#3d3846', live.f.skin.accent, 0.55);
    expect(cells(live.calls).filter((c) => c.style === idle)).toHaveLength(1);

    const still = frame({ model: { reduceMotion: true } });
    still.f.world.heldMomentum = { value: 0.05, holdLeftSec: 0 };
    still.f.world.clockSec = 0.5;
    drawMomentumMeter(still.f);
    expect(cells(still.calls).every((c) => c.style === '#3d3846')).toBe(true);
  });
});
