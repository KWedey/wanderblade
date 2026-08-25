import { describe, expect, it } from 'vitest';
import {
  ARC_GRAVITY,
  arcCaughtBy,
  arcFlightSec,
  arcInFlight,
  arcPosition,
  decayTo,
  floaterOffsetY,
  launchArc,
  lifeRemaining,
  liftForFlight,
  shakeOffset,
  stepParticle,
  wrap,
  type Particle,
} from '../src/scene/fx';

function coin(spanX = 60, lift = 150) {
  return launchArc(100, 40, spanX, 100, lift, 7, 'gold', 0);
}

describe('arc ballistics', () => {
  it('lands on the ground plane exactly at flightSec', () => {
    const arc = coin();
    expect(arcPosition(arc, arc.flightSec).y).toBeCloseTo(arc.landY, 6);
  });

  it('travels the requested horizontal span over the flight', () => {
    const arc = coin(-90);
    expect(arcPosition(arc, arc.flightSec).x).toBeCloseTo(100 - 90, 6);
  });

  it('peaks above the launch point before falling', () => {
    const arc = coin();
    const apex = arcPosition(arc, -arc.vy / ARC_GRAVITY).y;
    expect(apex).toBeLessThan(arc.y0);
    expect(arcPosition(arc, arc.flightSec).y).toBeGreaterThan(apex);
  });

  it('returns zero flight time when the launch is already below the ground', () => {
    expect(arcFlightSec(120, 0, 100)).toBe(0);
  });

  // The coin's time in the air has to equal the engine's catch window, or the
  // player can tap a coin that is no longer catchable.
  it('liftForFlight hits the requested flight time exactly', () => {
    for (const [y0, landY, t] of [
      [40, 100, 1.5],
      [100, 100, 0.8],
      [90, 40, 1.2],
    ] as const) {
      const lift = liftForFlight(y0, landY, t);
      expect(arcFlightSec(y0, -lift, landY)).toBeCloseTo(t, 9);
    }
  });

  it('liftForFlight is zero for a zero-length flight', () => {
    expect(liftForFlight(0, 10, 0)).toBe(0);
  });

  it('is catchable only while in flight', () => {
    const arc = coin();
    expect(arcInFlight(arc)).toBe(true);
    arc.age = arc.flightSec;
    expect(arcInFlight(arc)).toBe(false);
  });

  it('a caught arc is no longer catchable', () => {
    const arc = coin();
    arc.caught = true;
    expect(arcInFlight(arc)).toBe(false);
  });
});

describe('arcCaughtBy', () => {
  it('catches a strike inside the radius and misses one outside', () => {
    const arc = coin();
    arc.age = arc.flightSec / 2;
    const p = arcPosition(arc, arc.age);
    expect(arcCaughtBy(arc, p.x + 4, p.y - 4, 20)).toBe(true);
    expect(arcCaughtBy(arc, p.x + 40, p.y, 20)).toBe(false);
  });

  it('never catches a landed arc, however close the strike', () => {
    const arc = coin();
    arc.age = arc.flightSec + 0.01;
    const p = arcPosition(arc, arc.age);
    expect(arcCaughtBy(arc, p.x, p.y, 40)).toBe(false);
  });
});

describe('particles', () => {
  function spark(): Particle {
    return { x: 0, y: 0, vx: 10, vy: -20, age: 0, life: 0.5, size: 1, color: '#fff', gravity: 1 };
  }

  it('reports death once its life is spent', () => {
    const p = spark();
    expect(stepParticle(p, 0.4)).toBe(true);
    expect(stepParticle(p, 0.2)).toBe(false);
  });

  it('accelerates downward under gravity', () => {
    const p = spark();
    stepParticle(p, 0.1);
    expect(p.vy).toBeCloseTo(-20 + ARC_GRAVITY * 0.1, 6);
  });

  it('ignores gravity when the particle is weightless', () => {
    const p = { ...spark(), gravity: 0 };
    stepParticle(p, 0.1);
    expect(p.vy).toBe(-20);
  });

  it('clamps remaining life to the unit interval', () => {
    expect(lifeRemaining(0, 1)).toBe(1);
    expect(lifeRemaining(2, 1)).toBe(0);
    expect(lifeRemaining(0.25, 1)).toBeCloseTo(0.75, 6);
    expect(lifeRemaining(0, 0)).toBe(0);
  });
});

describe('floaters', () => {
  it('rises the full distance by end of life and eases out', () => {
    expect(floaterOffsetY(0, 1, 20)).toBe(-0);
    expect(floaterOffsetY(1, 1, 20)).toBeCloseTo(-20, 6);
    // Eased: more than half the travel is done at the halfway point.
    expect(floaterOffsetY(0.5, 1, 20)).toBeLessThan(-10);
  });
});

describe('shakeOffset', () => {
  it('is exactly zero at zero magnitude', () => {
    expect(shakeOffset(0, 1.23)).toEqual({ x: 0, y: 0 });
  });

  it('stays within the requested magnitude', () => {
    for (let t = 0; t < 3; t += 0.017) {
      const o = shakeOffset(2, t);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(2 + 1e-9);
    }
  });
});

describe('decayTo', () => {
  it('is frame-rate independent: one big step equals many small ones', () => {
    const once = decayTo(10, 0, 5, 0.2);
    let many = 10;
    for (let i = 0; i < 20; i++) many = decayTo(many, 0, 5, 0.01);
    expect(many).toBeCloseTo(once, 10);
  });
});

describe('wrap', () => {
  it('folds negative and over-span values back into [0, span)', () => {
    expect(wrap(-1, 10)).toBe(9);
    expect(wrap(11, 10)).toBe(1);
    expect(wrap(10, 10)).toBe(0);
    expect(wrap(5, 0)).toBe(0);
  });
});
