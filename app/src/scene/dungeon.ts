// The Portal dungeon: an enclosed stone room lit only by its own torches
// (DECISIONS.md #58). The banded-flat idiom of the road, in stone.

import type { FillCtx, Frame } from './frame';
import {
  brickJointXs,
  depthBandTones,
  lighten,
  lightnessOf,
  mixHex,
  momentumLift,
  pillarSpans,
  torchFlicker,
  torchGlowBands,
  vignetteInsets,
  type PillarSpan,
  type RealmSkin,
} from './palette';
import { GROUND_BANDS, drawGroundBands, fillFlatDisc } from './road';

/** Dungeon room geometry (DECISIONS.md #58): brick course height, wall/ceiling band counts, edge-vignette bands and their width in scene pixels. */
const BRICK_H = 7;
const WALL_BANDS = 3;
const VIGNETTE_BANDS = 5;
/** Vignette inset step as a fraction of the shorter viewport side — corners read as dark at any screen size without swallowing the piers the torches are meant to light. */
const VIGNETTE_STEP_FRAC = 0.012;
/** Each pier's width as a fraction of the room, and its lit inner edge's width in scene pixels. */
const PILLAR_FRAC = 0.13;
const PILLAR_EDGE_W = 3;
/** The two torches' horizontal position (fraction of room width, kept under the desktop dock's 0.6vw limit per DECISIONS.md #59) and flicker seed. */
const DUNGEON_TORCHES = [
  { side: 0.16, seed: 2.1 },
  { side: 0.58, seed: 5.7 },
] as const;
/** Torch light-pool reach as a fraction of room width — a pool, not a spotlight covering half the frame. */
const WALL_TORCH_REACH_FRAC = 0.075;
const FLOOR_TORCH_REACH_FRAC = 0.055;

/**
 * Brick courses from `top` to `bottom`: each row a flat tone (depth-banded
 * the same way the turf is) with 1px mortar joints staggered per row via
 * `brickJointXs`, so the wall reads as coursed masonry rather than tile.
 */
export function drawStoneWall(
  ctx: FillCtx,
  x: number,
  w: number,
  top: number,
  bottom: number,
  tones: readonly string[],
  jointTone: string,
  brickH: number,
): void {
  if (tones.length === 0) return;
  const h = Math.max(1, brickH);
  const rows = Math.max(1, Math.ceil((bottom - top) / h));
  for (let r = 0; r < rows; r++) {
    const y = top + r * h;
    const rowH = Math.min(h, bottom - y);
    if (rowH <= 0) break;
    const tone = tones[Math.max(0, Math.min(tones.length - 1, Math.floor((r / rows) * tones.length)))]!;
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w, rowH);
    ctx.fillStyle = jointTone;
    for (const jx of brickJointXs(w, r, h * 2)) {
      ctx.fillRect(x + jx, y, 1, rowH);
    }
  }
}

/**
 * Two coursed piers flanking the room, each with a lit edge facing the fight
 * — the same lit-face/shadow-face idiom the tree trunks use (DECISIONS.md #54).
 */
export function drawPillars(
  ctx: FillCtx,
  spans: readonly PillarSpan[],
  top: number,
  bottom: number,
  tones: readonly string[],
  jointTone: string,
  edgeColor: string,
  edgeW: number,
  brickH: number,
): void {
  for (const span of spans) {
    drawStoneWall(ctx, span.x, span.w, top, bottom, tones, jointTone, brickH);
    const edgeX = span.x === 0 ? span.x + span.w - edgeW : span.x;
    ctx.fillStyle = edgeColor;
    ctx.fillRect(edgeX, top, edgeW, bottom - top);
  }
}

/** Where a torch sits and how strongly its flame is currently burning. */
export interface TorchLight {
  x: number;
  y: number;
  flicker: number;
}

/** Light pools only — the stone each torch actually illuminates, painted before the flame itself. */
export function drawTorchGlow(
  ctx: FillCtx,
  torches: readonly TorchLight[],
  baseTone: string,
  flame: string,
  reach: number,
): void {
  // A pale realm's rock can out-value the flame colour, which would mix the
  // wall darker as the bands step in — lift the mix target above the base.
  const baseLightness = lightnessOf(baseTone);
  const flameLightness = lightnessOf(flame);
  // lighten(hex, t) raises lightness by t * (1 - L), not by t — invert that
  // to solve for the push that clears the base tone by a fixed margin.
  const tint =
    flameLightness > baseLightness
      ? flame
      : lighten(flame, Math.min(1, (baseLightness + 0.12 - flameLightness) / (1 - flameLightness)));
  for (const t of torches) {
    for (const band of torchGlowBands(reach * t.flicker)) {
      ctx.fillStyle = mixHex(baseTone, tint, band.mix);
      fillFlatDisc(ctx, t.x, t.y, band.r);
    }
  }
}

/** The flame itself: a filled core — a hollow ring reads as a marker, not fire (DECISIONS.md #53). */
export function drawTorchFlame(ctx: FillCtx, x: number, y: number, flicker: number, flame: string): void {
  ctx.fillStyle = mixHex(flame, '#000000', 0.3);
  fillFlatDisc(ctx, x, y, Math.max(1, Math.round(6 * flicker)));
  ctx.fillStyle = mixHex(flame, '#ffffff', 0.35);
  fillFlatDisc(ctx, x, y, Math.max(1, Math.round(3 * flicker)));
}

/**
 * Frame the room darkens toward at its very edges: concentric non-overlapping
 * border rings, outermost first, each a flat tone — discrete bands standing in
 * for a vignette gradient (DECISIONS.md #13).
 */
export function drawVignette(ctx: FillCtx, vw: number, vh: number, tones: readonly string[], step: number): void {
  const insets = vignetteInsets(tones.length, step);
  for (let i = 0; i < tones.length; i++) {
    const inset = insets[i]!;
    const innerW = Math.max(0, vw - inset * 2);
    const innerH = Math.max(0, vh - inset * 2 - step * 2);
    ctx.fillStyle = tones[i]!;
    ctx.fillRect(inset, inset, innerW, step);
    ctx.fillRect(inset, vh - inset - step, innerW, step);
    ctx.fillRect(inset, inset + step, step, innerH);
    ctx.fillRect(vw - inset - step, inset + step, step, innerH);
  }
}

/** The dungeon's one light source, tinted per realm (DECISIONS.md #58). */
export function torchFlame(skin: RealmSkin): string {
  return mixHex('#df7126', skin.accent, 0.25);
}

/** Both dungeon torches at a given height — same x/flicker everywhere they're drawn, only y varies. */
export function dungeonTorchesAt(f: Frame, y: number): TorchLight[] {
  return DUNGEON_TORCHES.map(({ side, seed }) => ({
    x: Math.round(f.view.vw * side),
    y,
    flicker: f.model.reduceMotion ? 0.92 : torchFlicker(f.world.clockSec, seed),
  }));
}

/**
 * The dungeon's walls, ceiling and edge vignette (DECISIONS.md #58) — the
 * unshaken backdrop layer, not part of the ground plane the camera jolts.
 */
export function drawDungeonBackdrop(f: Frame): void {
  const { ctx, view, skin } = f;
  const ceilingH = Math.max(8, Math.round(view.groundY * 0.22));
  const wallBase = mixHex(skin.rock, '#1a1c2c', 0.12);
  const ceilingBase = mixHex(skin.rock, '#1a1c2c', 0.55);
  const jointTone = mixHex(wallBase, '#1a1c2c', 0.45);

  drawGroundBands(ctx, view.vw, 0, ceilingH, depthBandTones(ceilingBase, WALL_BANDS));
  drawStoneWall(ctx, 0, view.vw, ceilingH, view.groundY, depthBandTones(wallBase, WALL_BANDS), jointTone, BRICK_H);

  const flame = torchFlame(skin);

  // Piers carry the realm's highlight ink so a dungeon skins per realm. Spanned
  // off view.worldRightX: the canvas paints under the docked panel. Drawn before the
  // torches, which are mounted on the stone they light.
  drawPillars(
    ctx,
    pillarSpans(view.worldRightX, PILLAR_FRAC),
    ceilingH,
    view.groundY,
    depthBandTones(mixHex(skin.rock, '#0a0a12', 0.4), WALL_BANDS),
    jointTone,
    mixHex(skin.rockLight, flame, 0.2),
    PILLAR_EDGE_W,
    BRICK_H,
  );

  // Torches: the fight's own light, since the room has no sky to borrow one
  // from (DECISIONS.md #58). A torch past the dock's 34% of vw is never seen.
  const torches = dungeonTorchesAt(f, ceilingH + Math.round((view.groundY - ceilingH) * 0.32));
  // The wall itself gets brighter near each flame instead of the flame
  // being a marker floating in front of unlit stone.
  drawTorchGlow(ctx, torches, wallBase, flame, view.vw * WALL_TORCH_REACH_FRAC);
  for (const t of torches) drawTorchFlame(ctx, t.x, t.y, t.flicker, flame);

  drawVignette(
    ctx,
    view.vw,
    view.sceneBottomY,
    depthBandTones(mixHex(ceilingBase, '#000000', 0.42), VIGNETTE_BANDS),
    Math.max(1, Math.round(Math.min(view.vw, view.sceneBottomY) * VIGNETTE_STEP_FRAC)),
  );
}

/** The dungeon's stone floor — same banded-turf idiom as the road, stone tones instead of grass. */
export function drawDungeonFloor(f: Frame): void {
  const { ctx, view, model, skin } = f;
  const belowH = Math.max(8, view.sceneBottomY - view.groundY);
  const floorH = Math.max(6, Math.floor(belowH * 0.9));
  const lift = momentumLift(model.momentum);
  const floorBase = mixHex(skin.rock, '#1a1c2c', 0.28);
  drawGroundBands(ctx, view.vw, view.groundY, floorH, depthBandTones(lighten(floorBase, lift), GROUND_BANDS));
  ctx.fillStyle = mixHex(floorBase, '#000000', 0.5);
  ctx.fillRect(0, view.groundY + floorH, view.vw, view.sceneBottomY - view.groundY - floorH);

  // Same torches, spilling a smaller pool onto the stone at their base —
  // one light source lighting the whole room, not just the wall behind it.
  const torches = dungeonTorchesAt(f, view.groundY + Math.round(floorH * 0.3));
  drawTorchGlow(ctx, torches, floorBase, torchFlame(skin), view.vw * FLOOR_TORCH_REACH_FRAC);
}
