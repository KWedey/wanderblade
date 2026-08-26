import { describe, expect, it } from 'vitest';

import { BOSS_SHAPE, MONSTER_SHAPES } from '../src/scene/pixels';
import { REGION_NAME_COUNT, describeEvent } from '../src/flavor';
import { GOLEM, ROSTER_COUNT, ROSTER_SIZE, SWARMLING, speciesAt } from '../src/species';

function killEvent(realm: number, killIndex: number) {
  return { type: 'kill', timeSec: 1, realm, zone: 3, killIndex, gold: 10 } as const;
}

describe('the log and the scene name one creature', () => {
  // The judge's finding: log said "Ashen Wolf", screen drew a robed caster.
  // Both halves read speciesAt, so the name and the silhouette cannot disagree
  // unless the roster itself is wrong — which the next test covers.
  it('names the creature whose silhouette the scene queues', () => {
    for (const realm of [0, 1, 4, 6, 7, 13]) {
      for (const kill of [0, 1, 2, 3, 4, 5, 97]) {
        const picked = speciesAt(realm, kill);
        const line = describeEvent(killEvent(realm, kill));
        expect(line?.text, `realm ${realm} kill ${kill}`).toContain(picked.name);
      }
    }
  });

  it('never names a creature the scene has no shape for', () => {
    for (let realm = 0; realm < ROSTER_COUNT + 3; realm++) {
      for (let kill = 0; kill < 12; kill++) {
        const { name, shape } = speciesAt(realm, kill);
        expect(Number.isInteger(shape), name).toBe(true);
        expect(shape, name).toBeGreaterThanOrEqual(0);
        expect(shape, name).toBeLessThan(MONSTER_SHAPES.length);
      }
    }
  });
});

describe('the roster follows the realm', () => {
  // `regionOfZone(state.zone)` divided a realm-local zone (0..49) by 50, so it
  // was 0 in every realm: the log drew its names from the first biome forever
  // while the scene skinned and shaped by the real realm. That is the disagree.
  it('names a different creature in a different realm', () => {
    const first = speciesAt(0, 0).name;
    const later = [1, 2, 3, 4, 5, 6].map((r) => speciesAt(r, 0).name);
    expect(later).not.toContain(first);
    expect(new Set(later).size, 'each realm needs its own creature').toBe(later.length);
  });

  // Biome name, realm skin and creature roster all cycle on the same modulo, so
  // a lapped realm reads as the same place with the same wildlife.
  it('laps with the biome names the scene skins by', () => {
    expect(ROSTER_COUNT).toBe(REGION_NAME_COUNT);
    expect(speciesAt(ROSTER_COUNT, 2)).toEqual(speciesAt(0, 2));
  });

  it('answers for any realm and any kill index', () => {
    for (const [realm, kill] of [
      [0, 0],
      [-1, -7],
      [99, 1_000_003],
      [6, -1],
    ] as const) {
      expect(speciesAt(realm, kill).name.length).toBeGreaterThan(0);
    }
  });
});

describe('every realm fields a varied roster', () => {
  function shapesOf(realm: number): Set<number> {
    return new Set(
      Array.from({ length: ROSTER_SIZE }, (_, k) => speciesAt(realm, k).shape),
    );
  }

  // A realm drawn from two silhouettes reads as a smaller game than the one
  // next door, and the extremes are what carry that: the thing that swarms and
  // the thing that towers.
  it('spans at least four silhouettes, the smallest and largest among them', () => {
    for (let realm = 0; realm < ROSTER_COUNT; realm++) {
      const shapes = shapesOf(realm);
      expect(shapes.size, `realm ${realm}`).toBeGreaterThanOrEqual(4);
      expect(shapes.has(SWARMLING), `realm ${realm} has no swarmer`).toBe(true);
      expect(shapes.has(GOLEM), `realm ${realm} has nothing that towers`).toBe(true);
    }
  });

  // The guardian's silhouette is the boss phase's alone. A road roster naming
  // it would put the end of the realm in the middle of a zone.
  it('never puts the Portal guardian on a road roster', () => {
    for (let realm = 0; realm < ROSTER_COUNT; realm++) {
      for (let kill = 0; kill < ROSTER_SIZE * 3; kill++) {
        expect(speciesAt(realm, kill).shape, `realm ${realm} kill ${kill}`).not.toBe(BOSS_SHAPE);
      }
    }
  });

  it('cycles the whole roster before repeating a creature', () => {
    for (let realm = 0; realm < ROSTER_COUNT; realm++) {
      const names = Array.from({ length: ROSTER_SIZE }, (_, k) => speciesAt(realm, k).name);
      expect(new Set(names).size, `realm ${realm}`).toBe(names.length);
    }
  });
});
