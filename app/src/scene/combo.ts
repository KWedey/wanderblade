// The combo widget's geometry: its label, the plate it sits on and the lanes
// it reserves. Shared by the meter that paints it and the floater allocator
// that routes around it, so neither has to import the other.

import { NUMERAL_FONT, textWidth } from './pixels';
import { LANE_COUNT, lanesTouching, type LaneSpan } from './textlane';

/** Segments, cells and label on one row: a widget, not a banner. */
const COMBO_GUTTER = 4;
/** Twice the numeral face: at scale 1 the label was 5 px tall in a corner and tapping read as nothing. */
export const COMBO_SCALE = 2;
export const COMBO_SEGS = 6;
export const COMBO_SEG_W = 2 * COMBO_SCALE;
export const COMBO_GAP = 1 * COMBO_SCALE;
export const COMBO_METER_W = COMBO_SEGS * (COMBO_SEG_W + COMBO_GAP) - COMBO_GAP;
/** Air between the DPS readout's bottom edge and the widget under it. */
const COMBO_DROP = 3;

export function comboLabel(heldMult: number): string {
  // Two decimals: the cap is x1.75 and one decimal prints an unreachable x1.8.
  // The word stays up; a bare x1.73 names no quantity.
  return `COMBO ×${heldMult.toFixed(2)}`;
}

/** Scene point the widget hangs from: the DPS readout's bottom-right corner, or null before the view has measured it. */
export type ComboAnchor = { x: number; y: number } | null;

/**
 * The widget's plate in scene pixels. It sits under the DPS readout, the one
 * number momentum actually moves, right-aligned to it. In portrait the readout
 * is above the band, so the widget takes the band's own top-right corner.
 */
export function comboBox(
  heldMult: number,
  anchor: ComboAnchor,
  worldRightX: number,
): { x: number; w: number; top: number; height: number } {
  const w = textWidth(comboLabel(heldMult), COMBO_SCALE, NUMERAL_FONT) + 3 * COMBO_SCALE + COMBO_METER_W;
  const height = (NUMERAL_FONT.h + 2) * COMBO_SCALE;
  const under = anchor !== null && anchor.y >= 0;
  const right = under ? Math.min(anchor.x, worldRightX - COMBO_GUTTER) : worldRightX - COMBO_GUTTER;
  return {
    x: Math.max(COMBO_GUTTER, Math.round(right - w)),
    w,
    top: under ? Math.round(anchor.y + COMBO_DROP) : COMBO_GUTTER,
    height,
  };
}

/** Lanes the widget sits across, so floaters route around all of them. */
export function comboSpans(heldMult: number, anchor: ComboAnchor, worldRightX: number, groundY: number): LaneSpan[] {
  const box = comboBox(heldMult, anchor, worldRightX);
  return lanesTouching(box.top, box.top + box.height, groundY, LANE_COUNT).map((lane) => ({
    x: box.x,
    w: box.w,
    lane,
  }));
}
