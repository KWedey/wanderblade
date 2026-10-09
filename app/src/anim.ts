// Pure presentation math for the render driver — no DOM, no engine imports,
// no clocks. Extracted so the frame-loop's load-bearing arithmetic is unit-
// testable without jsdom; game.ts owns all impure plumbing (RAF timestamps,
// performance.now(), recap state).

/**
 * Frame-rate-independent exponential approach: stepping once with dt or N
 * times with dt/N converges to the same value, so 60Hz and 120Hz displays
 * animate identically. `rate` is 1/s; larger settles faster.
 */
export function smoothStep(current: number, target: number, rate: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dtSec));
}

/**
 * Progress [0,1] through the kill scheduled to complete at `nextKillAtSec`,
 * as seen at display time `timeSec + sinceTickSec`. Clamped: purchases can
 * shrink `killDurSec` estimates mid-kill and extrapolation can run past the
 * schedule; neither may escape the unit interval.
 */
export function killProgress(
  nextKillAtSec: number,
  timeSec: number,
  sinceTickSec: number,
  killDurSec: number,
): number {
  const p = 1 - (nextKillAtSec - (timeSec + sinceTickSec)) / killDurSec;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Zone-bar fill [0,1]. Parked at a gate the zone count is frozen, so the bar
 * holds at the whole-kill mark; marching, it sweeps with the current kill.
 */
export function zoneSweep(
  atGate: boolean,
  killsInZone: number,
  progress: number,
  killsPerZone: number,
): number {
  if (atGate) return Math.min(1, killsInZone / killsPerZone);
  return Math.min(1, (killsInZone + progress) / killsPerZone);
}
