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
