/**
 * Hard-edged lighting. DECISIONS.md #13 bans blur and smooth gradients, so
 * falloff is an ordered dither: a pixel is lit or it is not, and the ratio of
 * lit pixels carries the intensity. This is how 16-bit consoles faked light.
 */

/** 4x4 Bayer matrix, values 0..15. */
export const BAYER: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

/**
 * True when a pixel should be painted at the given intensity.
 * `level` 0 paints nothing, 1 paints everything.
 */
export function ditherAt(x: number, y: number, level: number): boolean {
  if (level >= 1) return true;
  if (level <= 0) return false;
  const ix = ((x % 4) + 4) % 4;
  const iy = ((y % 4) + 4) % 4;
  const threshold = BAYER[iy * 4 + ix] ?? 0;
  return level * 16 > threshold;
}

/**
 * Intensity of a radial falloff at distance `d` from a light of radius `r`.
 * Linear, clamped, zero outside the radius.
 */
export function falloff(d: number, r: number): number {
  if (r <= 0) return 0;
  if (d >= r) return 0;
  return 1 - d / r;
}

/** Intensity for a ring: peaks on the ring itself and falls off both ways. */
export function ringFalloff(d: number, r: number, width: number): number {
  if (width <= 0) return 0;
  const off = Math.abs(d - r);
  if (off >= width) return 0;
  return 1 - off / width;
}

/**
 * Palette ramp for momentum. At rest the world sits at its authored colour;
 * at full momentum every lit surface climbs one step brighter.
 */
export function momentumLift(momentum: number, max = 0.22): number {
  return Math.max(0, Math.min(1, momentum)) * max;
}
