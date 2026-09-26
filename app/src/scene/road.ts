// The road diorama: sky, hills, turf and everything that scrolls past the hero.

import { clampHillStep, hillBaseInk, lighten } from './palette';
import type { FillCtx } from './frame';

/**
 * Stepped hill band — quantized columns give the hard pixel silhouette. A
 * dark base and a lit cap carry the slope's own form, the same two-band
 * trick drawRange uses below; a single flat fill read as a cardboard
 * cutout, not a hillside catching light from one direction.
 */
export function drawHills(
  ctx: FillCtx,
  vw: number,
  groundY: number,
  color: string,
  lip: string | null,
  scroll: number,
  amp: number,
  baseH: number,
  freq: number,
  stepPx: number,
  haze: string,
): void {
  const base = hillBaseInk(color, haze);
  const cap = lip ?? lighten(color, 0.22);
  // Column height is clamped to a slope the column width can actually draw
  // — the raw sine profile jumps further than a step is wide, which is what
  // a staircased silhouette looks like at this resolution.
  const maxDelta = stepPx * 1.5;
  let prevH: number | null = null;
  for (let x = 0; x < vw; x += stepPx) {
    const wx = (x + scroll) * freq;
    const rawH = Math.floor(
      baseH + Math.sin(wx * 0.035) * amp + Math.sin(wx * 0.0131 + 1.3) * amp * 0.6,
    );
    const h = clampHillStep(prevH, rawH, maxDelta);
    prevH = h;
    const top = groundY - h;
    const baseBandH = Math.max(1, Math.floor(h * 0.4));
    ctx.fillStyle = color;
    ctx.fillRect(x, top, stepPx, h);
    ctx.fillStyle = base;
    ctx.fillRect(x, groundY - baseBandH, stepPx, baseBandH);
    ctx.fillStyle = cap;
    ctx.fillRect(x, top, stepPx, 2);
  }
}

/** Horizontal value bands the turf splits into, far edge to near edge. */
export const GROUND_BANDS = 4;

/** Paints one tone per horizontal strip of the turf band — the same fixed-band idiom drawHills uses, applied to the ground plane instead of a silhouette. */
export function drawGroundBands(
  ctx: FillCtx,
  vw: number,
  groundY: number,
  turfH: number,
  tones: readonly string[],
): void {
  const bandH = Math.max(1, Math.floor(turfH / tones.length));
  let y = groundY;
  for (let i = 0; i < tones.length; i++) {
    const h = i === tones.length - 1 ? groundY + turfH - y : bandH;
    ctx.fillStyle = tones[i]!;
    ctx.fillRect(0, y, vw, h);
    y += h;
  }
}
