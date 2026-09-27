import { describe, expect, it } from 'vitest';

import { dayFraction, realmSkin, zoneSkin } from '../src/scene/palette';
import { drawSignposts, propsFor } from '../src/scene/road';
import { drawMonsters } from '../src/scene/actors';
import { DEATH_SEC, step } from '../src/scene/world';
import { frame } from './helpers/frame';

function road(zone: number, extra: Parameters<typeof frame>[0] = {}) {
  return frame({ ...extra, model: { zone, zonesInRealm: 50, kills: 3, ...extra.model } });
}

describe('the scene reads the zone off the model', () => {
  it('plants nothing on the first frame it ever sees', () => {
    const { f } = road(7);
    step(f.world, f, 1 / 60);
    expect(f.world.signposts).toEqual([]);
    expect(f.world.floaters.map((fl) => fl.text)).not.toContain('ZONE 8');
  });

  it('plants one signpost and one banner when the engine crosses a zone line', () => {
    const { f } = road(7);
    step(f.world, f, 1 / 60);
    f.model.zone = 8;
    step(f.world, f, 1 / 60);
    expect(f.world.signposts.map((s) => s.zone)).toEqual([9]);
    expect(f.world.signposts[0]!.x).toBeGreaterThan(f.view.worldRightX);
    expect(f.world.floaters.map((fl) => fl.text)).toContain('ZONE 9');
  });

  it('plants one post, not forty, when an offline return jumps the zone', () => {
    const { f } = road(2);
    step(f.world, f, 1 / 60);
    f.model.zone = 42;
    step(f.world, f, 1 / 60);
    expect(f.world.signposts).toHaveLength(1);
  });

  it('stays quiet when ascension sends the zone back to the start', () => {
    const { f } = road(49);
    step(f.world, f, 1 / 60);
    f.model.zone = 0;
    step(f.world, f, 1 / 60);
    expect(f.world.signposts).toEqual([]);
  });

  it('scrolls the post toward the hero with the ground and drops it once it is off the left edge', () => {
    const { f } = road(7);
    step(f.world, f, 1 / 60);
    f.model.zone = 8;
    step(f.world, f, 1 / 60);
    const x0 = f.world.signposts[0]!.x;
    step(f.world, f, 0.1);
    expect(f.world.signposts[0]!.x).toBeLessThan(x0);
    for (let i = 0; i < 400; i++) step(f.world, f, 0.1);
    expect(f.world.signposts).toEqual([]);
  });

  it('draws the zone number on the board once the post is on screen', () => {
    const { f, calls } = road(7);
    f.world.signposts.push({ x: 150, zone: 9 });
    drawSignposts(f);
    expect(calls.filter((c) => c.op === 'fillRect').length).toBeGreaterThan(6);
  });
});

describe('the backdrop drifts across the realm', () => {
  const base = realmSkin(0);

  it('is the authored skin at the first zone', () => {
    expect(zoneSkin(base, dayFraction(0, 50))).toBe(base);
  });

  it('turns the sky at the last zone and leaves the ground and the creatures alone (DECISIONS.md #38)', () => {
    const dusk = zoneSkin(base, dayFraction(49, 50));
    expect(dusk.skyTop).not.toBe(base.skyTop);
    expect(dusk.sun).not.toBe(base.sun);
    expect(dusk.turf).toBe(base.turf);
    expect(dusk.rock).toBe(base.rock);
    expect(dusk.monBody).toBe(base.monBody);
  });

  it('measures the day as a fraction that reaches 1 exactly at the last zone', () => {
    expect(dayFraction(0, 50)).toBe(0);
    expect(dayFraction(49, 50)).toBe(1);
    expect(dayFraction(25, 50)).toBeGreaterThan(0.4);
    expect(dayFraction(3, 1)).toBe(1);
  });

  it('lays a different road per zone and the same road for the same zone', () => {
    const a = propsFor(0);
    const b = propsFor(1);
    expect(propsFor(0)).toBe(a);
    expect(a.length === b.length && a.every((p, i) => p.at === b[i]!.at)).toBe(false);
  });
});

describe('a creature dies on screen instead of being swapped out', () => {
  it('keeps the corpse drawn for the death phase, then drops it', () => {
    const { f } = road(3);
    step(f.world, f, 1 / 60);
    f.model.kills = 4;
    step(f.world, f, 1 / 60);
    expect(f.world.fallen).toHaveLength(1);
    expect(f.world.queue[0]!.sprite).toBeDefined();
    step(f.world, f, DEATH_SEC / 2);
    expect(f.world.fallen).toHaveLength(1);
    step(f.world, f, DEATH_SEC);
    expect(f.world.fallen).toHaveLength(0);
  });

  it('plays one death for an offline return of a thousand kills', () => {
    const { f } = road(3);
    step(f.world, f, 1 / 60);
    f.model.kills = 1003;
    step(f.world, f, 1 / 60);
    expect(f.world.fallen).toHaveLength(1);
  });

  it('fits the death phase inside the engine kill floor', () => {
    expect(DEATH_SEC).toBeLessThanOrEqual(0.15);
  });

  it('keeps the size it died at once the scene is in the dungeon, and no road corpse follows the hero in', () => {
    const { f } = road(3);
    step(f.world, f, 1 / 60);
    f.model.kills = 4;
    step(f.world, f, 1 / 60);
    expect(f.world.fallen[0]!.scale).toBe(1);
    f.model.boss = true;
    step(f.world, f, 1 / 60);
    expect(f.world.fallen).toEqual([]);
  });

  it('flattens the corpse toward the ground line as it ages', () => {
    const { f, calls } = road(3);
    f.world.fallen.push({ sprite: 0, x: 120, age: DEATH_SEC * 0.5, scale: 1 });
    drawMonsters(f);
    const blits = calls.filter((c) => c.op === 'drawImage');
    expect(blits.length).toBeGreaterThan(0);
    expect(blits[0]!.h).toBeLessThan(10);
    expect(blits[0]!.y + blits[0]!.h).toBe(f.view.groundY);
  });
});

describe('a kill pays on screen', () => {
  it('raises +gold off the corpse when the engine lands a kill', () => {
    const { f } = road(3, { model: { goldPerKill: 7 } });
    step(f.world, f, 1 / 60);
    f.model.kills = 4;
    step(f.world, f, 1 / 60);
    const pay = f.world.floaters.find((fl) => fl.tier === 'payout' && fl.value > 0);
    expect(pay).toBeDefined();
    expect(pay!.text).toBe('+7.0');
  });

  it('grows one number rather than stacking a ladder when kills land fast', () => {
    const { f } = road(3, { model: { goldPerKill: 7 } });
    step(f.world, f, 1 / 60);
    f.model.kills = 4;
    step(f.world, f, 1 / 60);
    f.model.kills = 5;
    step(f.world, f, 1 / 60);
    const pays = f.world.floaters.filter((fl) => fl.tier === 'payout' && fl.value > 0);
    expect(pays).toHaveLength(1);
    expect(pays[0]!.value).toBe(14);
  });
});
