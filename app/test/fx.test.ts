import {
  ARC_FLIGHT_SEC,
  arcLandingX,
  arcPositionAt,
  sustainStrikeRate,
  type LootArc,
} from '@wanderblade/core';
import { HOLD_STRIKE_INTERVAL_SEC } from '../src/active';
import { describe, expect, it } from 'vitest';
import {
  ARC_GRAVITY,
  arcApexHeight,
  arcSpaceFromScene,
  sceneFromArcSpace,
  decayTo,
  floaterOffsetY,
  mergeTargetIndex,
  type Floater,
  type FloaterTier,
  lifeRemaining,
  shakeOffset,
  stepParticle,
  type Particle,
  wrap,
  heroPocket,
  peakFollow,
  PEAK_HOLD_SEC,
  inPocket,
  nudgeFromPocket,
} from '../src/scene/fx';
import { blitScaleFor, damagePerSwing, swingInterval } from '../src/scene/scene';

/** A core arc launched at t=0, so `arcPositionAt(arc, t)` reads as flight time. */
function coreArc(killIndex = 3): LootArc {
  return { gold: 7, expiresAtSec: ARC_FLIGHT_SEC, landingX: arcLandingX(killIndex), gear: null };
}

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

  // The scale exists to put core's arc on the pixel grid, so core's arc is what
  // it is measured against.
  it('lands core\'s unit apex on exactly that many pixels', () => {
    const apex = arcApexHeight(ARC_FLIGHT_SEC);
    const peak = arcPositionAt(coreArc(), ARC_FLIGHT_SEC / 2);
    const ground = 100;
    const drawn = sceneFromArcSpace(peak!.x, peak!.y, 0, ground, apex);
    expect(ground - drawn.y).toBeCloseTo(apex, 6);
  });
});

describe('arcSpaceFromScene', () => {
  it('puts the hero at the origin', () => {
    expect(arcSpaceFromScene(50, 100, 50, 100, 40)).toEqual({ x: 0, y: 0 });
  });

  it('puts the apex at y = 1', () => {
    expect(arcSpaceFromScene(50, 60, 50, 100, 40).y).toBeCloseTo(1);
  });

  // Core measures reach (0.5-1.5) and catch radius (0.12) in apex units, so x
  // must be normalized like y or arcHitIndex compares mixed units.
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

describe("core's arc drawn on the scene's pixel grid", () => {
  const ground = 120;
  const heroX = 40;
  const apex = arcApexHeight(ARC_FLIGHT_SEC);

  /** Where core says the arc is at `t`, in scene pixels. */
  function drawn(t: number) {
    const p = arcPositionAt(coreArc(), t)!;
    return sceneFromArcSpace(p.x, p.y, heroX, ground, apex);
  }

  it('leaves the hero on the ground line', () => {
    const p = drawn(1e-6);
    expect(p.x).toBeCloseTo(heroX, 3);
    expect(p.y).toBeCloseTo(ground, 3);
  });

  it('rises exactly arcApexHeight pixels at the half-way point', () => {
    expect(ground - drawn(ARC_FLIGHT_SEC / 2).y).toBeCloseTo(apex, 6);
  });

  it('touches back down on the ground line', () => {
    expect(drawn(ARC_FLIGHT_SEC * (1 - 1e-6)).y).toBeCloseTo(ground, 3);
  });

  // Reach is measured in apex units, so x scales by the same factor as y. A
  // pixel-scale change must not move where the coin is drawn relative to reach.
  it('lands core\'s reach at reach x apex pixels down the road', () => {
    expect(drawn(ARC_FLIGHT_SEC * (1 - 1e-6)).x - heroX).toBeCloseTo(arcLandingX(3) * apex, 2);
  });
});

describe('the hero keeps a protected pocket', () => {
  const HERO_W = 14;
  const HERO_H = 24;
  const GROUND = 200;
  const HERO_X = 60;
  const p = heroPocket(HERO_X, GROUND, HERO_W, HERO_H);

  // The blind art director: "at the exact moment it shows me combat, it hides
  // the character I am playing under its own effect."
  it('covers the whole silhouette with room to spare on every side', () => {
    expect(p.x).toBeLessThan(HERO_X - HERO_W / 2);
    expect(p.x + p.w).toBeGreaterThan(HERO_X + HERO_W / 2);
    expect(p.y).toBeLessThan(GROUND - HERO_H);
    expect(p.y + p.h).toBeGreaterThanOrEqual(GROUND);
  });

  it('catches a point anywhere on the figure, feet and crown included', () => {
    for (const [x, y] of [
      [HERO_X, GROUND - 1],
      [HERO_X, GROUND - HERO_H + 1],
      [HERO_X - HERO_W / 2, GROUND - HERO_H / 2],
      [HERO_X + HERO_W / 2, GROUND - HERO_H / 2],
    ] as const) {
      expect(inPocket(p, x, y), `${x},${y}`).toBe(true);
    }
  });

  it('lets the road either side of him through', () => {
    expect(inPocket(p, HERO_X + 40, GROUND - 10)).toBe(false);
    expect(inPocket(p, HERO_X - 40, GROUND - 10)).toBe(false);
    expect(inPocket(p, HERO_X, GROUND - HERO_H - 20)).toBe(false);
  });

  it('leaves a point that was already clear exactly where it was', () => {
    const far = nudgeFromPocket(p, HERO_X + 50, GROUND - 30);
    expect(far).toEqual({ x: HERO_X + 50, y: GROUND - 30 });
  });

  it('moves an intruding point out by the shortest way, and it stays out', () => {
    for (const [x, y] of [
      [HERO_X, GROUND - HERO_H + 2],
      [HERO_X - HERO_W / 2 + 1, GROUND - 4],
      [HERO_X + HERO_W / 2 - 1, GROUND - 4],
    ] as const) {
      const out = nudgeFromPocket(p, x, y);
      expect(inPocket(p, out.x, out.y), `${x},${y} -> ${out.x},${out.y}`).toBe(false);
    }
  });
});

describe('the momentum meter holds its peak', () => {
  const at = (v: number) => ({ value: v, holdLeftSec: 0 });

  // The playtest saw x1.7 and 5 of 6 pips at 25Hz against a true cap of x1.75.
  // Momentum decays between strikes, so a mid-gap sample of a player pinned at
  // the ceiling reads 0.9862 - which floors to 5 pips and truncates to x1.7.
  it('takes a new peak the instant it arrives', () => {
    expect(peakFollow(at(0.5), 0.99, 0.016).value).toBe(0.99);
    expect(peakFollow(at(0.5), 0.99, 0.016).holdLeftSec).toBe(PEAK_HOLD_SEC);
  });

  it('does not sag through the gap between two strikes at the cap', () => {
    let held = peakFollow(at(0), 1, 0.016);
    // 40ms apart is 25 taps a second; sustain only needs about 3.3.
    for (let i = 0; i < 6; i++) held = peakFollow(held, 0.9862, 0.04);
    expect(held.value).toBe(1);
    expect(Math.round(held.value * 6)).toBe(6);
  });

  it('falls once the hold expires, so the meter still reads the truth at rest', () => {
    let held = peakFollow(at(0), 1, 0.016);
    for (let i = 0; i < 60; i++) held = peakFollow(held, 0, 0.05);
    expect(held.value).toBe(0);
  });

  it('never rounds a sustained cap down out of its own last pip', () => {
    let held = peakFollow(at(0), 1, 0.016);
    for (let i = 0; i < 40; i++) {
      held = peakFollow(held, 0.9862, 0.04);
      expect(Math.min(6, Math.round(held.value * 6)), `sample ${i}`).toBe(6);
    }
  });
});

describe('the held-strike cadence comes from core, not a local copy', () => {
  // A client-side copy of the sustain rate settles a held strike below the cap
  // core would pin it at, so the cadence has to be derived, never declared.
  it('fires exactly at the rate that sustains momentum', () => {
    expect(HOLD_STRIKE_INTERVAL_SEC).toBeCloseTo(1 / sustainStrikeRate(), 12);
  });

  it('is a real cadence, not a placeholder', () => {
    expect(HOLD_STRIKE_INTERVAL_SEC).toBeGreaterThan(0.05);
    expect(HOLD_STRIKE_INTERVAL_SEC).toBeLessThan(2);
  });
});

// The Ascendancy speed node changed core's kill rate and nothing on screen.
// A purchase whose visible reward never arrives is a broken promise, so the
// blade now runs on core's attack speed -- without the scene inventing damage.
describe('the swing carries core dps whatever speed it runs at', () => {
  // ascSpeedMultiplier tops out at 1 + ASC_SPEED_MAX_BONUS; momentum stacks on
  // top of that, so this spans idle through a maxed node at full momentum.
  const SPEEDS = [1, 1.2, 1.6, 2, 2.56, 4];

  it('apportions dps across the interval a swing represents', () => {
    for (const speed of SPEEDS) {
      const swingsPerSec = 1 / swingInterval(speed);
      const integrated = damagePerSwing(1234.5, speed) * swingsPerSec;
      expect(integrated, `speed ${speed}`).toBeCloseTo(1234.5, 6);
    }
  });

  it('pays less per swing as the blade speeds up, never more', () => {
    for (let i = 1; i < SPEEDS.length; i++) {
      expect(damagePerSwing(1000, SPEEDS[i]!)).toBeLessThan(damagePerSwing(1000, SPEEDS[i - 1]!));
    }
  });

  // A fixed 0.32s stroke at a maxed node and full momentum overruns its own
  // interval, and overlapping swings read as a blur rather than as faster hits.
  it('leaves room between strokes at every speed', () => {
    for (const speed of SPEEDS) {
      const stroke = Math.min(0.32, swingInterval(speed) * 0.9);
      expect(stroke, `speed ${speed}`).toBeLessThan(swingInterval(speed));
    }
  });

  it('never divides by a zero attack speed', () => {
    expect(Number.isFinite(damagePerSwing(1000, 0))).toBe(true);
  });
});

describe('payouts landing on the same spot', () => {
  const run = (x: number, value: number, tier: FloaterTier = 'catch'): Floater => ({
    x,
    y: 0,
    age: 0,
    life: 1,
    text: '',
    color: '#fff',
    tier,
    lane: 0,
    owned: false,
    value,
  });

  it('joins the nearest live run instead of starting a ladder', () => {
    const live = [run(100, 5), run(112, 7)];
    expect(mergeTargetIndex(live, 'catch', 118, 26)).toBe(1);
  });

  it('starts its own run once the last one is out of reach', () => {
    expect(mergeTargetIndex([run(100, 5)], 'catch', 140, 26)).toBe(-1);
  });

  it('never merges across tiers — damage and gold stay separate numbers', () => {
    const live = [run(100, 5, 'damage')];
    expect(mergeTargetIndex(live, 'catch', 100, 26)).toBe(-1);
  });

  it('leaves labels alone — UPGRADED carries no value to add to', () => {
    expect(mergeTargetIndex([run(100, 0)], 'catch', 100, 26)).toBe(-1);
  });
})

describe('the display blit', () => {
  /** cssW, dpr, and the scene width the scene picks at that size. */
  const CASES: [string, number, number, number][] = [
    ['iPhone portrait dpr3', 390, 3, 195],
    ['iPhone portrait dpr2', 390, 2, 195],
    ['Android portrait dpr3', 360, 3, 180],
    ['iPhone landscape dpr3', 844, 3, 282],
    ['judged desktop', 1920, 1, 320],
    ['odd desktop width', 1517, 1, 304],
  ];

  it('is a whole number of device pixels per scene pixel everywhere', () => {
    for (const [name, cssW, dpr, sceneW] of CASES) {
      const blit = blitScaleFor(cssW, dpr, sceneW);
      expect(Number.isInteger(blit), `${name} blits at a fraction`).toBe(true);
      expect(blit, `${name} blits below 1:1`).toBeGreaterThanOrEqual(1);
    }
  });

  // The regression: sizing the backing store off cssW * dpr alone gave 8.979
  // on a landscape phone, and a nearest-neighbour stretch at 8.979 duplicates
  // some columns nine times and others eight.
  it('costs less than one scene pixel of width to snap', () => {
    for (const [name, cssW, dpr, sceneW] of CASES) {
      const blit = blitScaleFor(cssW, dpr, sceneW);
      const drift = Math.abs(sceneW * blit - Math.floor(cssW * dpr));
      expect(drift, `${name} snaps ${drift} device pixels away`).toBeLessThan(blit);
    }
  });
})
