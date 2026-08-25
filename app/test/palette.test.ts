import { describe, expect, it } from 'vitest';

import {
  MIN_ACCENT_LIGHTNESS,
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
