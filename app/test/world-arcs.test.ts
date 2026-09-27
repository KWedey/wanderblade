import { ARC_FLIGHT_SEC, arcHitIndex, arcLandingX, arcPositionAt, type LootArc } from '@wanderblade/core';
import { describe, expect, it } from 'vitest';

import { createViewport } from '../src/scene/geometry';
import { arcScreenPoints, fromArcSpace, killPointX, step, strike, toArcSpace } from '../src/scene/world';
import { frame } from './helpers/frame';

const view = { ...createViewport(), vw: 300, vh: 170, groundY: 120, arcBaseY: 118, worldRightX: 200, heroX: 72 };

function arc(killIndex: number, launchSec: number, gear: LootArc['gear'] = null): LootArc {
  return { gold: 5, expiresAtSec: launchSec + ARC_FLIGHT_SEC, landingX: arcLandingX(killIndex), gear };
}

describe('the tap-aim conversion is the exact inverse of the coin draw mapping', () => {
  it('round-trips scene points through arc space and back', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: view.heroX, y: view.groundY },
      { x: 173.5, y: 61.25 },
      { x: 299, y: 169 },
    ]) {
      const a = toArcSpace(view, p.x, p.y);
      const back = fromArcSpace(view, a.x, a.y);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('round-trips arc-space points through the scene and back', () => {
    for (const a of [
      { x: 0, y: 0 },
      { x: 1.5, y: 1 },
      { x: 0.37, y: 0.91 },
    ]) {
      const p = fromArcSpace(view, a.x, a.y);
      const back = toArcSpace(view, p.x, p.y);
      expect(back.x).toBeCloseTo(a.x, 9);
      expect(back.y).toBeCloseTo(a.y, 9);
    }
  });

  it('lets a tap on a drawn coin catch that coin, by core\'s own hit test', () => {
    const arcs = [arc(3, 10), arc(4, 10.2), arc(5, 10.4)];
    const timeSec = 10.7;
    const { f } = frame({ view, model: { arcs, timeSec } });
    const points = arcScreenPoints(f);
    expect(points).toHaveLength(3);
    points.forEach((p, i) => {
      const aim = toArcSpace(view, p.x, p.y);
      expect(arcHitIndex(arcs, aim, timeSec)).toBe(i);
    });
  });
});

describe('coins launch from the kill point and land on the road ahead', () => {
  it('starts every arc at the engaged creature, not the hero', () => {
    const a = arc(3, 10);
    const { f } = frame({ view, model: { arcs: [a], timeSec: 10 + 1e-6 } });
    const [p] = arcScreenPoints(f);
    expect(p!.x).toBeCloseTo(killPointX(view), 2);
    expect(killPointX(view)).toBeGreaterThan(view.heroX + 20);
  });

  it('lands past the kill point, never on the hero', () => {
    for (let k = 0; k < 20; k++) {
      const landing = fromArcSpace(view, arcLandingX(k), 0);
      expect(landing.x).toBeGreaterThan(killPointX(view) + 20);
      expect(landing.y).toBe(view.arcBaseY);
    }
  });

  it('clears the creature at the apex', () => {
    const a = arc(3, 10);
    const p = arcPositionAt(a, 10 + ARC_FLIGHT_SEC / 2)!;
    expect(view.arcBaseY - fromArcSpace(view, p.x, p.y).y).toBeGreaterThan(30);
  });
});

describe('a coin that lands uncaught rests on the road and is collected by the hero', () => {
  function landed(over: { catches?: number; gear?: LootArc['gear'] } = {}) {
    const a = arc(3, 10, over.gear ?? null);
    const { f } = frame({ view, model: { arcs: [a], timeSec: 10.5, kills: 2 } });
    step(f.world, f, 1 / 60);
    f.world.catchesToAbsorb = over.catches ?? 0;
    f.model = { ...f.model, arcs: [], timeSec: 10 + ARC_FLIGHT_SEC + 0.05 };
    step(f.world, f, 1 / 60);
    return f;
  }

  it('rests exactly where core put the coin down', () => {
    const f = landed();
    expect(f.world.rests).toHaveLength(1);
    const at = fromArcSpace(view, arcLandingX(3), 0);
    // It has already ridden one frame of ground scroll toward the hero.
    expect(at.x - f.world.rests[0]!.x).toBeGreaterThan(0);
    expect(at.x - f.world.rests[0]!.x).toBeLessThan(1.5);
    expect(f.world.rests[0]!.gold).toBe(true);
  });

  it('rests as a gem when the coin carried gear', () => {
    const f = landed({ gear: { slot: 'weapon', rarity: 'common', realm: 0, zone: 0 } });
    expect(f.world.rests[0]!.gold).toBe(false);
  });

  it('does not rest a coin the engine reported caught', () => {
    const f = landed({ catches: 1 });
    expect(f.world.rests).toEqual([]);
    expect(f.world.catchesToAbsorb).toBe(0);
  });

  it('sees a coin land when the engine prunes its list in place, as core does', () => {
    const arcs = [arc(3, 10)];
    const { f } = frame({ view, model: { arcs, timeSec: 10.5, kills: 2 } });
    step(f.world, f, 1 / 60);
    arcs.length = 0;
    f.model = { ...f.model, timeSec: 10 + ARC_FLIGHT_SEC + 0.05 };
    step(f.world, f, 1 / 60);
    expect(f.world.rests).toHaveLength(1);
  });

  it('does not litter the road after an offline return', () => {
    const a = arc(3, 10);
    const { f } = frame({ view, model: { arcs: [a], timeSec: 10.5, kills: 2 } });
    step(f.world, f, 1 / 60);
    f.model = { ...f.model, arcs: [], timeSec: 10 + 3600 };
    step(f.world, f, 1 / 60);
    expect(f.world.rests).toEqual([]);
  });

  it('rides the ground back to the hero and streaks to the counter there', () => {
    const f = landed();
    const rest = f.world.rests[0]!;
    const x0 = rest.x;
    step(f.world, f, 0.2);
    expect(rest.x).toBeLessThan(x0);
    for (let i = 0; i < 100 && f.world.rests.length > 0; i++) step(f.world, f, 0.05);
    expect(f.world.rests).toEqual([]);
    expect(f.world.streaks.length + f.world.particles.length).toBeGreaterThan(0);
  });
});

describe('an aimed strike reports where it landed in arc space', () => {
  it('maps the tap through the same conversion the coins are drawn with', () => {
    const { f } = frame({ view });
    const { aim } = strike(f.world, f, { x: 150, y: 80 });
    expect(aim).toEqual(toArcSpace(view, 150, 80));
    expect(f.world.lastAim).toEqual({ x: 150, y: 80 });
  });
});

describe('a strike that hits nothing is a miss the player can see', () => {
  it('reports a miss and throws a slash spark at the tap when no creature is in reach and no coin is under it', () => {
    const { f } = frame({ view });
    f.world.queue.push({ sprite: 0, x: view.worldRightX + 30, flash: 0, recoil: 0, bob: 0, spread: 0 });
    const r = strike(f.world, f, { x: 40, y: 20 });
    expect(r.missed).toBe(true);
    expect(f.world.particles.length).toBeGreaterThan(0);
    const spark = f.world.particles[0]!;
    expect(Math.abs(spark.x - 40)).toBeLessThan(12);
    expect(Math.abs(spark.y - 20)).toBeLessThan(8);
  });

  function engaged() {
    const { f } = frame({ view, model: { kills: 3 } });
    step(f.world, f, 1 / 60);
    f.model.killProgress = 0.9;
    step(f.world, f, 1 / 60);
    return f;
  }

  it('is not a miss when the tap lands on the engaged creature', () => {
    const f = engaged();
    const lead = f.world.queue[0]!;
    const r = strike(f.world, f, { x: lead.x, y: view.groundY - 8 });
    expect(r.missed).toBe(false);
    expect(lead.flash).toBeGreaterThan(0);
  });

  it('is a miss when the tap is in the sky, even with a creature under the blade: the blade swung at what was aimed at', () => {
    const f = engaged();
    const lead = f.world.queue[0]!;
    const r = strike(f.world, f, { x: 40, y: 20 });
    expect(r.missed).toBe(true);
    expect(lead.flash).toBe(0);
    expect(f.world.swingAnim).toBeGreaterThan(0);
  });

  it('is not a miss for an unaimed strike while a creature is under the blade', () => {
    const f = engaged();
    expect(strike(f.world, f, null).missed).toBe(false);
  });

  it('is not a miss when the tap sits on a drawn coin, even with no creature in reach', () => {
    const arcs = [arc(3, 10)];
    const { f } = frame({ view, model: { arcs, timeSec: 10.7 } });
    const [p] = arcScreenPoints(f);
    expect(strike(f.world, f, { x: p!.x, y: p!.y }).missed).toBe(false);
  });

  it('lets an unaimed strike auto-aim at the nearest coin and not miss', () => {
    const arcs = [arc(3, 10)];
    const { f } = frame({ view, model: { arcs, timeSec: 10.7 } });
    const r = strike(f.world, f, null);
    expect(r.aim).not.toBeNull();
    expect(r.missed).toBe(false);
  });

  it('calls an unaimed strike at an empty road a miss', () => {
    const { f } = frame({ view });
    expect(strike(f.world, f, null).missed).toBe(true);
  });
});
