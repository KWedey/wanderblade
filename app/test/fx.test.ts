import { describe, expect, it } from 'vitest';
import {
  ARC_GRAVITY,
  arcApexHeight,
  arcCaughtBy,
  arcFlightSec,
  arcInFlight,
  arcPosition,
  arcSpaceFromScene,
  sceneFromArcSpace,
  decayTo,
  floaterOffsetY,
  launchArc,
  lifeRemaining,
  liftForFlight,
  shakeOffset,
  stepParticle,
  type Particle,
  wrap,
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

describe('arcApexHeight', () => {
  it('is g*T^2/8', () => {
    expect(arcApexHeight(1.5, 160)).toBeCloseTo((160 * 1.5 * 1.5) / 8);
  });

  it('never returns a degenerate scale', () => {
    expect(arcApexHeight(0, 160)).toBe(1);
  });

  it('matches the apex the ballistics reach over level ground', () => {
    // The y scale of arc space is a constant, so it is the level-flight apex.
    // A real arc that lands lower than it launched rises further than this by
    // exactly that drop, which is why the scale must not depend on either.
    const y = 100;
    const flight = 1.5;
    const arc = launchArc(0, y, -40, y, liftForFlight(y, y, flight), 5, 'gold', 0);
    const apexY = arcPosition(arc, -arc.vy / ARC_GRAVITY).y;
    expect(y - apexY).toBeCloseTo(arcApexHeight(flight), 6);
  });

  it('is exceeded by exactly the drop when the arc lands lower', () => {
    const y0 = 90;
    const landY = 100;
    const flight = 1.5;
    const arc = launchArc(0, y0, -40, landY, liftForFlight(y0, landY, flight), 5, 'gold', 0);
    const apexY = arcPosition(arc, -arc.vy / ARC_GRAVITY).y;
    const rise = landY - apexY;
    expect(rise).toBeGreaterThan(arcApexHeight(flight));
    expect(rise).toBeLessThan(arcApexHeight(flight) + (landY - y0) + 1);
  });
});

describe('arcSpaceFromScene', () => {
  it('puts the hero at the origin', () => {
    expect(arcSpaceFromScene(50, 100, 50, 100, 40)).toEqual({ x: 0, y: 0 });
  });

  it('puts the apex at y = 1', () => {
    expect(arcSpaceFromScene(50, 60, 50, 100, 40).y).toBeCloseTo(1);
  });

  // Core measures reach (0.5-1.5) and catch radius (0.12) in apex units, so a
  // point is only comparable against them if x is normalized like y. The old
  // assertion here kept x in raw scene pixels, which made the distance test in
  // arcHitIndex mix units.
  it('is independent of pixel scale in both axes', () => {
    const a = arcSpaceFromScene(120, 60, 50, 100, 40);
    const b = arcSpaceFromScene(240, 120, 100, 200, 80);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });

  it('round-trips through sceneFromArcSpace', () => {
    const back = sceneFromArcSpace(1.75, 1, 50, 100, 40);
    expect(back.x).toBeCloseTo(120);
    expect(back.y).toBeCloseTo(60);
  });
});

describe('level-flight arcs', () => {
  it('launches and lands on one line, so arc-space y = 0 at both ends', () => {
    const base = 120;
    const flight = 1.5;
    const arc = launchArc(0, base, -50, base, liftForFlight(base, base, flight), 5, 'gold', 0);
    const apex = arcApexHeight(flight);
    expect(arcSpaceFromScene(arc.x0, base, 0, base, apex).y).toBeCloseTo(0);
    const landing = arcPosition(arc, flight);
    expect(arcSpaceFromScene(landing.x, landing.y, 0, base, apex).y).toBeCloseTo(0, 4);
  });

  it('peaks at arc-space y = 1 halfway through the flight', () => {
    const base = 120;
    const flight = 1.5;
    const arc = launchArc(0, base, -50, base, liftForFlight(base, base, flight), 5, 'gold', 0);
    const mid = arcPosition(arc, flight / 2);
    expect(arcSpaceFromScene(mid.x, mid.y, 0, base, arcApexHeight(flight)).y).toBeCloseTo(1, 4);
  });
});
