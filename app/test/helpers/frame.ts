import type { Frame, SceneModel, SceneSprites, SkinnedSprites } from '../../src/scene/frame';
import { createViewport, type Viewport } from '../../src/scene/geometry';
import { realmSkin } from '../../src/scene/palette';
import type { BakedSprite } from '../../src/scene/sprites';
import { createWorld } from '../../src/scene/world';
import { sceneModel } from '../scene-model';

export interface Call {
  op: 'fillRect' | 'drawImage';
  style: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Records fills and blits; every other context method is a no-op, so a draw function runs without a canvas. */
export function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
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

export function fakeSprite(width: number, height: number): BakedSprite {
  const image = {} as HTMLCanvasElement;
  return { image, flash: image, width, height, mass: { top: 0, width } };
}

export function fakeSkinned(): SkinnedSprites {
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

export function frame(over: { model?: Partial<SceneModel>; view?: Partial<Viewport> } = {}): { f: Frame; calls: Call[] } {
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
