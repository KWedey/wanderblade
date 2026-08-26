// Pure presentation math for the road scene: loot-arc ballistics, particle and
// floater lifetimes, and camera shake. No DOM, no canvas, no clocks — the
// renderer owns those, so every trajectory here is unit-testable.
//
// All coordinates are *scene units* (virtual pixels), y growing downward.

/**
 * Downward acceleration for loot arcs and gibs, units/s². Tuned so a launched
 * coin stays airborne about a second — long enough for a deliberate tap to
 * catch it, which is the whole point of the mechanic.
 */
export const ARC_GRAVITY = 110;

export type LootKind = 'gold' | 'gear';

export interface LootArc {
  x0: number;
  y0: number;
  vx: number;
  /** Launch vertical velocity; negative is upward. */
  vy: number;
  /** Scene y the arc settles on. */
  landY: number;
  /** Seconds since launch. */
  age: number;
  /** Seconds from launch to landing. */
  flightSec: number;
  /** Base payout, for the floater the arc spawns when it resolves. */
  value: number;
  kind: LootKind;
  caught: boolean;
  /** Spin phase so tumbling coins do not all flash in lockstep. */
  spin: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Time for a projectile launched at `vy` from `y0` to fall to `landY`.
 * Returns 0 when the launch already sits at or below the ground.
 */
export function arcFlightSec(y0: number, vy: number, landY: number, gravity = ARC_GRAVITY): number {
  const drop = landY - y0;
  const disc = vy * vy + 2 * gravity * drop;
  if (disc <= 0) return 0;
  return (-vy + Math.sqrt(disc)) / gravity;
}

/**
 * Upward launch speed that puts a projectile on `landY` after exactly
 * `flightSec`. Solving for it — rather than picking a lift and accepting
 * whatever flight falls out — is what lets the coin's time in the air match the
 * engine's catch window instead of merely resembling it.
 */
export function liftForFlight(
  y0: number,
  landY: number,
  flightSec: number,
  gravity = ARC_GRAVITY,
): number {
  if (flightSec <= 0) return 0;
  return (gravity * flightSec) / 2 - (landY - y0) / flightSec;
}

/** Position of `arc` at `t` seconds after launch (unclamped — see arcAlive). */
export function arcPosition(arc: LootArc, t: number, gravity = ARC_GRAVITY): Vec2 {
  return {
    x: arc.x0 + arc.vx * t,
    y: arc.y0 + arc.vy * t + 0.5 * gravity * t * t,
  };
}

/**
 * Build an arc that leaves (x0, y0) and lands `spanX` units away on `landY`.
 * `lift` is the upward launch speed — bigger throws a taller, slower arc.
 */
export function launchArc(
  x0: number,
  y0: number,
  spanX: number,
  landY: number,
  lift: number,
  value: number,
  kind: LootKind,
  spin: number,
  gravity = ARC_GRAVITY,
): LootArc {
  const flightSec = arcFlightSec(y0, -lift, landY, gravity);
  return {
    x0,
    y0,
    vx: flightSec > 0 ? spanX / flightSec : 0,
    vy: -lift,
    landY,
    age: 0,
    flightSec,
    value,
    kind,
    caught: false,
    spin,
  };
}

/** An arc is catchable from launch until it touches down. */
export function arcInFlight(arc: LootArc): boolean {
  return !arc.caught && arc.age < arc.flightSec;
}

/**
 * Whether a strike at (px, py) with radius `r` catches `arc`. The catch box is
 * generous on purpose: this is a thumb on a phone, not a precision test.
 */
export function arcCaughtBy(arc: LootArc, px: number, py: number, r: number): boolean {
  if (!arcInFlight(arc)) return false;
  const p = arcPosition(arc, arc.age);
  const dx = p.x - px;
  const dy = p.y - py;
  return dx * dx + dy * dy <= r * r;
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
 * Apex of a loot arc in scene pixels for a given flight time: g*T^2/8.
 * This is the y scale of arc space, so it must come from the same constants
 * the ballistics use rather than being picked to look right.
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
