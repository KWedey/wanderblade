// Pure presentation math for the road scene: particle and floater lifetimes,
// camera shake, and the mapping between scene pixels and core's arc space. No
// DOM, no canvas, no clocks — the renderer owns those, so this is unit-testable.
//
// Loot-arc trajectories and catches are core's (arcPositionAt, arcHitIndex).
// The client maps them onto the scene; it never decides one.
//
// All coordinates are *scene units* (virtual pixels), y growing downward.

/**
 * Downward acceleration for gibs and sparks, units/s². Also sets the pixel
 * height of one unit of core's arc space, so a coin drawn along core's
 * trajectory rises to the same apex a thrown gib would.
 */
export const ARC_GRAVITY = 110;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  /** Fraction of ARC_GRAVITY this particle feels; 0 floats, 1 falls like loot. */
  gravity: number;
}

/** Integrate one particle in place. Returns false once its life is spent. */
export function stepParticle(p: Particle, dtSec: number): boolean {
  p.age += dtSec;
  if (p.age >= p.life) return false;
  p.vy += ARC_GRAVITY * p.gravity * dtSec;
  p.x += p.vx * dtSec;
  p.y += p.vy * dtSec;
  return true;
}

/** Remaining life as [0,1], 1 at spawn falling to 0 at death. */
export function lifeRemaining(age: number, life: number): number {
  if (life <= 0) return 0;
  const r = 1 - age / life;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

/**
 * Where a number sits in the reading order. One rule per tier, applied
 * everywhere: four numbers at four sizes in two colors is what an unranked
 * scene looks like.
 */
export type FloaterTier = 'payout' | 'catch' | 'damage';

export interface Floater {
  x: number;
  y: number;
  age: number;
  life: number;
  text: string;
  color: string;
  tier: FloaterTier;
  /** Row index above `y`, so two runs never share pixels. */
  lane: number;
  /** Belongs to the engaged monster, and dies with it. */
  owned: boolean;
}

/** Floaters drift up and ease out, so late frames barely move. */
export function floaterOffsetY(age: number, life: number, rise: number): number {
  const t = life <= 0 ? 1 : Math.min(1, age / life);
  return -rise * (1 - (1 - t) * (1 - t));
}

/**
 * Camera shake offset. Deterministic in `tSec` (no RNG) with two incommensurate
 * frequencies so it reads as a rattle rather than a wobble.
 */
export function shakeOffset(magnitude: number, tSec: number): Vec2 {
  if (magnitude <= 0) return { x: 0, y: 0 };
  return {
    x: Math.sin(tSec * 61) * magnitude,
    y: Math.sin(tSec * 43 + 1.7) * magnitude * 0.7,
  };
}

/**
 * Frame-rate-independent decay toward zero: stepping once with dt or N times
 * with dt/N lands on the same value.
 */
export function decayTo(value: number, target: number, rate: number, dtSec: number): number {
  return target + (value - target) * Math.exp(-rate * dtSec);
}

/** Wrap `v` into [0, span) — used to scroll parallax layers without unbounded growth. */
export function wrap(v: number, span: number): number {
  if (span <= 0) return 0;
  const m = v % span;
  return m < 0 ? m + span : m;
}

/**
 * Pixel height of core's unit-high arc apex over `flightSec`: g*T^2/8. Derived
 * from the scene's own gravity rather than picked to look right, so loot and
 * gibs share one sense of weight.
 */
export function arcApexHeight(flightSec: number, gravity = ARC_GRAVITY): number {
  return Math.max(1, (gravity * flightSec * flightSec) / 8);
}

/**
 * Scene pixels to the engine's arc space: hero at the origin, x along the
 * road, apex at y = 1. Scene units never cross the engine boundary, so a
 * resize or a pixel-scale change cannot move where a Strike lands.
 */
export function arcSpaceFromScene(
  px: number,
  py: number,
  heroX: number,
  groundY: number,
  apex: number,
): Vec2 {
  return { x: (px - heroX) / Math.max(1, apex), y: (groundY - py) / Math.max(1, apex) };
}

/** Inverse of `arcSpaceFromScene`: core's arc space back onto the pixel grid. */
export function sceneFromArcSpace(
  ax: number,
  ay: number,
  heroX: number,
  groundY: number,
  apex: number,
): Vec2 {
  const k = Math.max(1, apex);
  return { x: heroX + ax * k, y: groundY - ay * k };
}

/**
 * The one region of the frame that must always read. A blind art director
 * ranked our world above the bar's and still placed us second: "at the exact
 * moment it shows me combat, it hides the character I am playing under its own
 * effect." Nothing bright is drawn inside this box.
 */
export interface HeroPocket {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Empty pixels demanded around the silhouette before an effect may show. */
export const POCKET_PAD = 3;

export function heroPocket(
  heroX: number,
  groundY: number,
  spriteW: number,
  spriteH: number,
): HeroPocket {
  return {
    x: heroX - spriteW / 2 - POCKET_PAD,
    y: groundY - spriteH - POCKET_PAD,
    w: spriteW + POCKET_PAD * 2,
    // Down to the contact shadow: a spark at his feet breaks the silhouette
    // against the ground as readily as one across his chest.
    h: spriteH + POCKET_PAD * 2,
  };
}

/** True when a point would land inside the protected pocket. */
export function inPocket(pocket: HeroPocket, x: number, y: number): boolean {
  return x >= pocket.x && x <= pocket.x + pocket.w && y >= pocket.y && y <= pocket.y + pocket.h;
}

/**
 * Pushes a point clear of the pocket along whichever axis costs least. Used
 * where an effect has a meaningful position that happens to land on the hero,
 * so it moves aside rather than vanishing.
 */
export function nudgeFromPocket(
  pocket: HeroPocket,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!inPocket(pocket, x, y)) return { x, y };
  const left = x - pocket.x;
  const right = pocket.x + pocket.w - x;
  const up = y - pocket.y;
  const best = Math.min(left, right, up);
  if (best === up) return { x, y: pocket.y - 1 };
  return { x: best === left ? pocket.x - 1 : pocket.x + pocket.w + 1, y };
}

/**
 * Peak-hold for the momentum meter. Momentum decays continuously between
 * strikes, so a sample taken mid-gap reads below the cap even when the player
 * is pinned at it: at 25 taps/sec the gap is 40ms, which reads 0.9862 and used
 * to floor to 5 of 6 pips and truncate to x1.7. The meter told a player at the
 * ceiling they had not reached it. A VU meter solves this by holding the peak.
 */
export const PEAK_HOLD_SEC = 0.4;
/** How fast the held peak falls once the hold expires, in units per second. */
export const PEAK_FALL_PER_SEC = 1.2;

export interface PeakState {
  value: number;
  holdLeftSec: number;
}

export function peakFollow(held: PeakState, live: number, dtSec: number): PeakState {
  if (live >= held.value) return { value: live, holdLeftSec: PEAK_HOLD_SEC };
  const left = held.holdLeftSec - dtSec;
  if (left > 0) return { value: held.value, holdLeftSec: left };
  return { value: Math.max(live, held.value - PEAK_FALL_PER_SEC * dtSec), holdLeftSec: 0 };
}
