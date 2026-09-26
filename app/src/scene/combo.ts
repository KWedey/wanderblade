// The combo widget's geometry: its label, the plate it sits on and the lanes
// it reserves. Shared by the meter that paints it and the floater allocator
// that routes around it, so neither has to import the other.

import { NUMERAL_FONT, textWidth } from './pixels';
import { LANE_COUNT, lanesTouching, type LaneSpan } from './textlane';

/** Segments, cells and label on one row: a widget, not a banner. */
const COMBO_GUTTER = 4;
export const COMBO_SEGS = 6;
export const COMBO_SEG_W = 2;
export const COMBO_GAP = 1;
export const COMBO_METER_W = COMBO_SEGS * (COMBO_SEG_W + COMBO_GAP) - COMBO_GAP;

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
