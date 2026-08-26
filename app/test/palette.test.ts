import { describe, expect, it } from 'vitest';

import {
  backdropSkin,
  MIN_ACCENT_LIGHTNESS,
  groundBladeOf,
  MAX_TEXTURE_CONTRAST,
  MIN_SPRITE_BACKDROP_GAP,
  MIN_SKY_LIGHTNESS,
  MIN_VALUE_SPREAD,
  REALM_SKIN_COUNT,
  lightnessOf,
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
