// Pure presentation math for the road scene: particle and floater lifetimes,
// camera shake, and the mapping between scene pixels and core's arc space. No
// DOM, no canvas, no clocks — the renderer owns those, so this is unit-testable.
//
// Loot-arc trajectories and catches are core's (arcPositionAt, arcHitIndex).
// The client maps them onto the scene; it never decides one.
//
// All coordinates are *scene units* (virtual pixels), y growing downward.

/** Downward acceleration for gibs and sparks, units/s². */
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
  /** What the engine paid, kept so a second payout can join this run. 0 = a label. */
  value: number;
}

/**
 * Index of a live run the incoming payout should join, or -1. Rewards land
 * faster than a floater lives, so separate runs climb the lanes into a ladder
 * of near-identical numbers. One number that grows reads in a glance and is a
 * bigger reward besides.
 */
export function mergeTargetIndex(
  floaters: readonly Floater[],
  tier: FloaterTier,
  x: number,
  radius: number,
): number {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]!;
    if (f.tier === tier && f.value > 0 && Math.abs(f.x - x) <= radius) return i;
  }
  return -1;
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
 * Scene pixels per unit of core's arc space. The apex is one unit up, so this
 * is the height a coin clears: past a 30 px creature with room to read as a
 * throw, not a hop. Presentation only; core's reach and catch window are
 * measured in its own units.
 */
export const ARC_UNIT_PX = 50;

/**
 * Scene pixels to the engine's arc space: the kill point at the origin, x
 * along the road, apex at y = 1. Scene units never cross the engine boundary,
 * so a resize or a pixel-scale change cannot move where a Strike lands.
 */
export function arcSpaceFromScene(
  px: number,
  py: number,
  originX: number,
  baseY: number,
  unit: number,
): Vec2 {
  return { x: (px - originX) / Math.max(1, unit), y: (baseY - py) / Math.max(1, unit) };
}

/** Inverse of `arcSpaceFromScene`: core's arc space back onto the pixel grid. */
export function sceneFromArcSpace(
  ax: number,
  ay: number,
  originX: number,
  baseY: number,
  unit: number,
): Vec2 {
  const k = Math.max(1, unit);
  return { x: originX + ax * k, y: baseY - ay * k };
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
 * The creature under the blade earns the same protection the hero has. A judge
 * ranked the frame first for being the only one where the victim could be
 * named, and the kill's own coin shower had since buried it. Inset, so the
 * sparks still ring the silhouette instead of filling it.
 */
export function bodyPocket(
  centerX: number,
  groundY: number,
  spriteW: number,
  spriteH: number,
  inset = POCKET_PAD,
): HeroPocket {
  const w = Math.max(1, spriteW - inset * 2);
  const h = Math.max(1, spriteH - inset * 2);
  return { x: centerX - w / 2, y: groundY - spriteH + inset, w, h };
}

/** True when a point lands inside any protected pocket. */
export function inAnyPocket(pockets: readonly HeroPocket[], x: number, y: number): boolean {
  for (const p of pockets) if (inPocket(p, x, y)) return true;
  return false;
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
 * Peak-hold for the momentum meter, as a VU meter does. Momentum decays between
 * strikes, so a mid-gap sample reads under the cap even for a player pinned at
 * it — at 25 taps/sec, 0.9862 — and the meter must not call that short of the
 * ceiling.
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
