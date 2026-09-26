// World-anchored HUD and effects drawn over the actors: floaters, the combo
// meter, landed coins and their streaks to the gold readout, particles.

import type { Frame } from './frame';
import type { FloaterTier } from './fx';
import { OUTLINE_INK, mixHex } from './palette';
import { NUMERAL_FONT, textWidth } from './pixels';
import { drawText } from './sprites';
import { COMBO_LANE, LANE_COUNT, laneBaseline, lanesTouching, type LaneSpan } from './textlane';

/**
 * The number hierarchy. Gold headline lives in the DOM HUD; everything in the
 * world ranks below it and every in-world number is assigned a tier here, so
 * size and color are never picked per call site.
 */
export const TIER_SCALE: Record<FloaterTier, number> = { payout: 1, catch: 1, damage: 1 };

/** Segments, cells and label on one row: a widget, not a banner. */
const COMBO_GUTTER = 4;
const COMBO_SEGS = 6;
const COMBO_SEG_W = 2;
const COMBO_GAP = 1;
const COMBO_METER_W = COMBO_SEGS * (COMBO_SEG_W + COMBO_GAP) - COMBO_GAP;

export function comboLabel(heldMult: number): string {
  // Two decimals: the cap is x1.75 and one decimal prints an unreachable x1.8.
  // The word stays up; a bare x1.73 names no quantity.
  return `COMBO ×${heldMult.toFixed(2)}`;
}

/**
 * The widget's plate in scene pixels. It is drawn in the body face while
 * floaters ride the shorter numeral grid, so it is taller than one lane and
 * has to reserve every lane it covers rather than claiming just its own.
 */
export function comboBox(heldMult: number): { x: number; w: number; top: number; height: number } {
  const w = textWidth(comboLabel(heldMult), 1, NUMERAL_FONT) + 3 + COMBO_METER_W;
  return {
    // The upper-left gutter, out of the fight's airspace: riding it on the
    // hero put it over the one part of the frame that has to read.
    x: COMBO_GUTTER,
    w,
    top: COMBO_GUTTER,
    height: NUMERAL_FONT.h + 2,
  };
}

/** Lanes the widget sits across, so floaters route around all of them. */
export function comboSpans(heldMult: number, groundY: number): LaneSpan[] {
  const box = comboBox(heldMult);
  return lanesTouching(box.top, box.top + box.height, groundY, LANE_COUNT).map((lane) => ({
    x: box.x,
    w: box.w,
    lane,
  }));
}

export function drawMomentumMeter(f: Frame): void {
  const { ctx, model, skin, world } = f;
  // Hidden at rest: a full-width empty bar labelled x1.0 is the frame
  // announcing that nothing is happening.
  if (world.heldMomentum.value <= 0.02) return;
  const label = comboLabel(world.heldMult.value);
  const labelW = textWidth(label, 1, NUMERAL_FONT);
  const box = comboBox(world.heldMult.value);
  const y = laneBaseline(COMBO_LANE, f.view.groundY);
  const hot = world.heldMomentum.value > 0.7;

  // Outlined type, no plate. The 1px ring is what every other number in the
  // world wears, and it is what keeps this legible over sky or canopy
  // without pasting a rectangle of chrome across the frame.
  drawText(ctx, label, box.x, y, {
    scale: 1,
    fill: hot ? '#ffffff' : skin.accent,
    outline: OUTLINE_INK,
    align: 'left',
    font: NUMERAL_FONT,
  });

  const meterX = box.x + labelW + 3;
  const meterY = y + 1;
  // The pip track is built the way the creature health bar is built: a dark
  // frame with cells inside it, so the two read as the same world's meters.
  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(meterX - 1, meterY - 1, COMBO_METER_W + 2, NUMERAL_FONT.h + 2);
  const filled = Math.min(COMBO_SEGS, Math.round(world.heldMomentum.value * COMBO_SEGS));
  // At rest a row of dark cells reads as broken, not idle. A slow chase
  // light across the empty cells reads as armed and waiting.
  const chase = model.reduceMotion ? -1 : Math.floor(world.clockSec * 6) % COMBO_SEGS;
  for (let i = 0; i < COMBO_SEGS; i++) {
    const lit = i < filled;
    const idle = filled === 0 && i === chase;
    ctx.fillStyle = lit
      ? i >= COMBO_SEGS - 2
        ? '#ffffff'
        : skin.accent
      : idle
        ? mixHex('#3d3846', skin.accent, 0.55)
        : '#3d3846';
    ctx.fillRect(meterX + i * (COMBO_SEG_W + COMBO_GAP), meterY, COMBO_SEG_W, NUMERAL_FONT.h);
  }
}
