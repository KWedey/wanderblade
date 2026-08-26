import { describe, expect, it } from 'vitest';

import {
  MAX_TEXTURE_CONTRAST,
  MIN_ACCENT_LIGHTNESS,
  MIN_SKY_LIGHTNESS,
  MIN_SPRITE_BACKDROP_GAP,
  MIN_VALUE_SPREAD,
  REALM_SKIN_COUNT,
  backdropSkin,
  groundBladeOf,
  lightnessOf,
  glowRingRadii,
  momentumLift,
  realmSkin,
  skinValueSpread,
} from '../src/scene/palette';

describe('realm value floor', () => {
  it('holds across the whole realm range, not just the first and the last', () => {
    for (let region = 0; region < 500; region++) {
      const skin = realmSkin(region);
      expect(skinValueSpread(skin), `realm ${region} spread`).toBeGreaterThanOrEqual(
        MIN_VALUE_SPREAD,
      );
      expect(lightnessOf(skin.skyTop), `realm ${region} sky`).toBeGreaterThanOrEqual(
        MIN_SKY_LIGHTNESS,
      );
      expect(lightnessOf(skin.accent), `realm ${region} accent`).toBeGreaterThanOrEqual(
        MIN_ACCENT_LIGHTNESS,
      );
    }
  });

  it('does not decay with realm index — realm 199 is no darker than realm 1', () => {
    const early = realmSkin(1);
    const late = realmSkin(199);
    expect(skinValueSpread(late)).toBeGreaterThanOrEqual(skinValueSpread(early) * 0.85);
    expect(lightnessOf(late.skyTop)).toBeGreaterThanOrEqual(lightnessOf(early.skyTop) * 0.85);
  });

  it('keeps every realm distinct rather than flattening them to one look', () => {
    const skies = new Set<string>();
    for (let i = 0; i < REALM_SKIN_COUNT; i++) skies.add(realmSkin(i).skyTop);
    expect(skies.size).toBe(REALM_SKIN_COUNT);
  });

  it('is stable — the same region always returns the same skin object', () => {
    expect(realmSkin(199)).toBe(realmSkin(199));
    expect(realmSkin(199)).toBe(realmSkin(199 + REALM_SKIN_COUNT));
  });

  it('treats a negative region as the first realm', () => {
    expect(realmSkin(-5)).toBe(realmSkin(0));
  });
});

describe('depth grade separates the sprite plane from the backdrop', () => {
  const realms = Array.from({ length: 500 }, (_, i) => realmSkin(i));

  it('pushes every background band darker than the skin it came from', () => {
    for (const skin of realms) {
      const far = backdropSkin(skin);
      for (const band of ['range', 'hillFar', 'hillNear', 'leaf', 'leafDark', 'bark'] as const) {
        expect(lightnessOf(far[band]), `${band}`).toBeLessThan(lightnessOf(skin[band]));
      }
    }
  });

  it('clears the monster body over the canopy behind it in every realm', () => {
    for (const [i, skin] of realms.entries()) {
      const canopy = lightnessOf(backdropSkin(skin).leaf);
      expect(lightnessOf(skin.monBody) - canopy, `realm ${i}`).toBeGreaterThanOrEqual(
        MIN_SPRITE_BACKDROP_GAP,
      );
    }
  });

  it('leaves the sprite plane and the sky untouched', () => {
    for (const skin of realms) {
      const far = backdropSkin(skin);
      for (const band of ['skyTop', 'turf', 'soil', 'monBody', 'accent', 'fern', 'rock'] as const) {
        expect(far[band], `${band}`).toBe(skin[band]);
      }
    }
  });

  it('keeps the graded backdrop below the sky, so the frame reads front to back', () => {
    for (const [i, skin] of realms.entries()) {
      const far = backdropSkin(skin);
      expect(lightnessOf(skin.skyTop), `realm ${i}`).toBeGreaterThan(lightnessOf(far.hillFar));
      expect(lightnessOf(far.hillFar), `realm ${i}`).toBeGreaterThan(lightnessOf(far.range) - 0.2);
    }
  });
});

describe('ground texture never fights the sprites', () => {
  it('keeps the blade tone within reach of its turf in every realm', () => {
    for (let region = 0; region < 500; region++) {
      const skin = realmSkin(region);
      const delta = Math.abs(lightnessOf(groundBladeOf(skin)) - lightnessOf(skin.turf));
      expect(delta, `realm ${region}`).toBeLessThanOrEqual(MAX_TEXTURE_CONTRAST + 1e-9);
    }
  });

  it('leaves a blade that was already close alone', () => {
    const skin = realmSkin(0);
    if (Math.abs(lightnessOf(skin.grassBlade) - lightnessOf(skin.turf)) <= MAX_TEXTURE_CONTRAST) {
      expect(groundBladeOf(skin)).toBe(skin.grassBlade);
    }
  });
});

describe('momentumLift', () => {
  it('is zero at rest and clamped at full', () => {
    expect(momentumLift(0)).toBe(0);
    expect(momentumLift(1)).toBeCloseTo(0.22);
    expect(momentumLift(3)).toBeCloseTo(0.22);
  });
});

describe('a glow carries intensity as ring count, not as dither', () => {
  it('spends more rings as gain rises, and never more than three', () => {
    expect(glowRingRadii(40, 0.1)).toHaveLength(1);
    expect(glowRingRadii(40, 0.5)).toHaveLength(2);
    expect(glowRingRadii(40, 1)).toHaveLength(3);
    expect(glowRingRadii(40, 9)).toHaveLength(3);
  });

  it('draws the outermost ring first and steps inward', () => {
    const radii = glowRingRadii(40, 1);
    expect(radii[0]).toBe(40);
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeLessThan(radii[i - 1]!);
  });

  it('draws nothing at no radius, no gain, or a ring under a pixel', () => {
    expect(glowRingRadii(0, 1)).toEqual([]);
    expect(glowRingRadii(40, 0)).toEqual([]);
    expect(glowRingRadii(1, 1)).not.toContain(0);
  });
});
