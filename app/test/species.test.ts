import { speciesIndex } from '@wanderblade/core';
import { describe, expect, it } from 'vitest';

import { BOSS_SHAPE, MONSTER_SHAPES } from '../src/scene/pixels';
import { NO_BREAK, plainText } from '../src/pixeltext';
import { REGION_NAME_COUNT, describeEvent } from '../src/flavor';
import {
  GOLEM,
  ROSTER_COUNT,
  ROSTER_SIZE,
  SWARMLING,
  rosterAt,
  speciesAt,
  speciesIndexAt,
} from '../src/species';
import {
  MIN_BODY_CONTRAST,
  SAME_HUE_CONTRAST,
  REALM_SKIN_COUNT,
  lightnessOf,
  monsterInk,
  realmSkin,
} from '../src/scene/palette';

function killEvent(realm: number, killIndex: number) {
  // The species is the engine's answer, exactly as it stamps it on a real kill.
  return {
    type: 'kill',
    timeSec: 1,
    realm,
    zone: 3,
    killIndex,
    gold: 10,
    species: speciesIndex(killIndex),
  } as const;
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
        const where = `realm ${realm} kill ${kill}`;
        // The name is held against the wrap (#44), so the stored string carries
        // U+00A0 where the player reads a space. Both halves are the claim: the
        // right creature, and its name whole rather than split down two rows.
        expect(plainText(line?.text ?? ''), where).toContain(picked.name);
        expect(line?.text, where).toContain(picked.name.replace(/ /g, NO_BREAK));
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
  // The roster itself, not a window of kills: the engine picks slots from an
  // irrational sequence, so five consecutive kills no longer visit five slots.
  function shapesOf(realm: number): Set<number> {
    return new Set(rosterAt(realm).map((sp) => sp.shape));
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

  it('names every creature in the roster once, so none is a duplicate', () => {
    for (let realm = 0; realm < ROSTER_COUNT; realm++) {
      const names = rosterAt(realm).map((sp) => sp.name);
      expect(new Set(names).size, `realm ${realm}`).toBe(names.length);
    }
  });

  // Replaces "cycles the whole roster before repeating": the engine no longer
  // cycles, so the thing worth holding is that nothing is stranded - a creature
  // drawn and coloured but never fielded is dead content.
  it('fields every creature in the roster within a session of kills', () => {
    for (let realm = 0; realm < ROSTER_COUNT; realm++) {
      const seen = new Set(
        Array.from({ length: 200 }, (_, k) => speciesAt(realm, k).name),
      );
      expect(seen.size, `realm ${realm} strands a creature`).toBe(ROSTER_SIZE);
    }
  });
});

describe('a creature wears its own colour, not its realm\'s', () => {
  const realms = [...Array<number>(ROSTER_COUNT).keys()];

  const GROUNDS = realms.map((r) => realmSkin(r % REALM_SKIN_COUNT).turf);

  // The regression this exists for: colour used to come from the realm skin, so
  // one silhouette was purple in Greenwood and orange in Ember Wastes. Nothing
  // a player could learn to recognise. Every realm's real turf is fed in, so a
  // formula that reads the ground's hue fails here rather than passing on two
  // greys that happen to agree.
  it('gives one species the same hue and saturation on every realm\'s ground', () => {
    for (const realm of realms) {
      for (const sp of rosterAt(realm)) {
        const inks = GROUNDS.map((g) => monsterInk(sp.body, g));
        const [first] = inks;
        for (const key of ['body', 'bodyDark', 'bodyLight', 'bodySpec']) {
          for (const ink of inks) {
            expect(satOf(ink[key]!), `${sp.name} ${key} saturation`).toBeCloseTo(
              satOf(first![key]!),
              1,
            );
            // Hue is meaningless on a near-grey: an 8-bit round trip moves Marsh
            // Drake's 0.08 by a whole percent. Saturation still holds those.
            if (satOf(ink[key]!) < 0.15) continue;
            // 0.02 is 7 degrees. Rounding costs up to half of it on a dark
            // olive; the smallest re-hue this ever shipped was 0.05.
            expect(
              Math.abs(hueOf(ink[key]!) - hueOf(first![key]!)),
              `${sp.name} ${key} hue`,
            ).toBeLessThan(0.02);
          }
        }
      }
    }
  });

  it('stands every creature clear of the ground it walks on', () => {
    for (const realm of realms) {
      const skin = realmSkin(realm % REALM_SKIN_COUNT);
      const turf = lightnessOf(skin.turf);
      for (const sp of rosterAt(realm)) {
        const body = lightnessOf(monsterInk(sp.body, skin.turf, skin.rock).body!);
        expect(
          Math.abs(body - turf),
          `${sp.name} sits ${body.toFixed(2)} against turf ${turf.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(MIN_BODY_CONTRAST - 0.005);
      }
    }
  });

  // "The enemy's dark grey lower mass merges with the grey rock cluster and
  // reads as an outcrop the hero happens to be standing next to." The turf is
  // not the only thing a creature is seen against, and the Ashen Wolf sat 0.045
  // from the boulder behind it while clearing the grass by a comfortable 0.173.
  it('stands every creature clear of the rock it stands beside', () => {
    for (const realm of realms) {
      const skin = realmSkin(realm % REALM_SKIN_COUNT);
      const rock = lightnessOf(skin.rock);
      for (const sp of rosterAt(realm)) {
        const body = lightnessOf(monsterInk(sp.body, skin.turf, skin.rock).body!);
        expect(
          Math.abs(body - rock),
          `${sp.name} sits ${body.toFixed(2)} against rock ${rock.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(MIN_BODY_CONTRAST - 0.005);
      }
    }
  });

  // Light and specular had a ceiling each, and above mid 0.76 they crossed: the
  // facet meant to catch the light came out darker than the band under it.
  it('ramps every creature\'s four inks in one direction', () => {
    for (const realm of realms) {
      const skin = realmSkin(realm % REALM_SKIN_COUNT);
      for (const sp of rosterAt(realm)) {
        const ink = monsterInk(sp.body, skin.turf, skin.rock);
        const ramp = ['bodyDark', 'body', 'bodyLight', 'bodySpec'].map((k) =>
          lightnessOf(ink[k]!),
        );
        for (let i = 1; i < ramp.length; i++) {
          expect(ramp[i]!, `${sp.name} ramp ${ramp.map((v) => v.toFixed(2)).join(' < ')}`)
            .toBeGreaterThan(ramp[i - 1]!);
        }
      }
    }
  });

  // The frame that forced this rule: a dark-teal Green Sprite on Greenwood's
  // grass, a clean 0.17 apart in value and still a green smear on green.
  it('demands more value from a creature that shares its ground\'s hue', () => {
    const grass = '#6abe30';
    const green = lightnessOf(monsterInk('#37946e', grass).body!);
    const rust = lightnessOf(monsterInk('#8f563b', grass).body!);
    const turf = lightnessOf(grass);
    expect(Math.abs(green - turf)).toBeGreaterThan(Math.abs(rust - turf));
    expect(Math.abs(green - turf)).toBeGreaterThanOrEqual(
      MIN_BODY_CONTRAST + SAME_HUE_CONTRAST * 0.5,
    );
  });

  it('never fields two creatures of one colour in one realm', () => {
    for (const realm of realms) {
      const seen = rosterAt(realm).map((sp) => sp.body);
      expect(new Set(seen).size, `realm ${realm}`).toBe(seen.length);
    }
  });

  it('indexes the roster slot the scene bakes a sprite for', () => {
    for (const realm of [0, 3, 6, 9]) {
      for (const kill of [0, 1, 4, 5, 97]) {
        const slot = speciesIndexAt(realm, kill);
        expect(rosterAt(realm)[slot], `realm ${realm} kill ${kill}`).toEqual(speciesAt(realm, kill));
      }
    }
  });
});

function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h / 6;
}

function satOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (l > 0.5 ? 2 - max - min : max + min);
}

describe('the app never re-derives which species a kill was', () => {
  it('maps the engine\'s own species index onto the realm roster', () => {
    for (const realm of [0, 2, 5, 9, 13]) {
      for (let kill = 0; kill < 60; kill++) {
        const n = rosterAt(realm).length;
        expect(speciesIndexAt(realm, kill), `realm ${realm} kill ${kill}`).toBe(
          speciesIndex(kill) % n,
        );
      }
    }
  });

  // The engine picks from an irrational sequence, not killIndex % 5. An app
  // that computes its own slot draws a different creature from the one the log
  // names — the break the species roster exists to prevent.
  it('does not agree with a modulo of the kill index', () => {
    const n = ROSTER_SIZE;
    const differs = [...Array<number>(200).keys()].filter(
      (k) => speciesIndexAt(0, k) !== k % n,
    );
    expect(differs.length, 'the engine now picks by modulo after all').toBeGreaterThan(20);
  });
});
