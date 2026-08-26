import { describe, expect, it } from 'vitest';

import {
  MAX_TEXTURE_CONTRAST,
  MIN_ACCENT_LIGHTNESS,
  MIN_SKY_LIGHTNESS,
  MIN_SPRITE_BACKDROP_GAP,
  MIN_VALUE_SPREAD,
  REALM_SKIN_COUNT,
  backdropSkin,
  foliageNotchAt,
  grassClumpBlades,
  groundBladeOf,
  inFoliageLobe,
  inRun,
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

describe('a pine crown carries its silhouette as lobes, not a per-row roll', () => {
  it('is zero outside every lobe', () => {
    const lobe = { from: 5, len: 5, depth: 4 };
    expect(foliageNotchAt(0, [lobe])).toBe(0);
    expect(foliageNotchAt(10, [lobe])).toBe(0);
  });

  it('peaks at the lobe centre, tapering to zero at both ends', () => {
    const lobe = { from: 10, len: 7, depth: 4 };
    expect(foliageNotchAt(13, [lobe])).toBeCloseTo(4);
    expect(foliageNotchAt(10, [lobe])).toBeCloseTo(0);
    expect(foliageNotchAt(16, [lobe])).toBeCloseTo(0);
  });

  it('sums overlapping lobes', () => {
    const a = { from: 0, len: 11, depth: 2 };
    const b = { from: 0, len: 11, depth: 3 };
    expect(foliageNotchAt(5, [a, b])).toBeCloseTo(5);
  });

  it('clamps the total when several lobes stack on the same row', () => {
    const lobes = [0, 1, 2, 3].map(() => ({ from: 5, len: 11, depth: 4 }));
    expect(foliageNotchAt(10, lobes)).toBe(8);
    expect(foliageNotchAt(10, lobes.map((l) => ({ ...l, depth: -4 })))).toBe(-8);
  });

  it('never jumps between adjacent rows the way an independent roll did', () => {
    // Four lobes across a 50-row crown, the shape drawGrove actually builds.
    const lobes = [0, 1, 2, 3].map((li) => ({
      from: (li * 11) % 50,
      len: 10,
      depth: (li % 2 === 0 ? 1 : -1) * 4,
    }));
    let prev = foliageNotchAt(0, lobes);
    let maxDelta = 0;
    for (let row = 1; row < 50; row++) {
      const cur = foliageNotchAt(row, lobes);
      maxDelta = Math.max(maxDelta, Math.abs(cur - prev));
      prev = cur;
    }
    expect(maxDelta).toBeLessThan(3.5);
  });
});

describe('inRun', () => {
  it('is true only inside a run, false right at and past its end', () => {
    expect(inRun(3, 4, 3)).toBe(false);
    expect(inRun(4, 4, 3)).toBe(true);
    expect(inRun(6, 4, 3)).toBe(true);
    expect(inRun(7, 4, 3)).toBe(false);
  });
});

describe('inFoliageLobe', () => {
  it('is true only inside a run, false right at and past its end', () => {
    const lobe = { from: 4, len: 3 };
    expect(inFoliageLobe(3, [lobe])).toBe(false);
    expect(inFoliageLobe(4, [lobe])).toBe(true);
    expect(inFoliageLobe(6, [lobe])).toBe(true);
    expect(inFoliageLobe(7, [lobe])).toBe(false);
  });

  it('is true if any lobe in the list covers the row', () => {
    const lobes = [{ from: 0, len: 2 }, { from: 10, len: 2 }];
    expect(inFoliageLobe(11, lobes)).toBe(true);
    expect(inFoliageLobe(5, lobes)).toBe(false);
  });
});

describe('grassClumpBlades', () => {
  it('always includes the stamped blade plus at least one neighbour', () => {
    const blades = grassClumpBlades(0, 0, 0);
    expect(blades.length).toBeGreaterThanOrEqual(2);
    expect(blades[0]).toEqual({ dx: 0, dy: 0 });
  });

  it('adds a third blade only above the roll threshold', () => {
    expect(grassClumpBlades(0.5, 0.5, 0.34)).toHaveLength(2);
    expect(grassClumpBlades(0.5, 0.5, 0.36)).toHaveLength(3);
  });

  it('keeps neighbours close enough to overlap the clump, not scatter', () => {
    for (let i = 0; i < 50; i++) {
      const r1 = (i * 0.037) % 1;
      const r2 = (i * 0.071) % 1;
      const r3 = (i * 0.113) % 1;
      for (const b of grassClumpBlades(r1, r2, r3)) {
        expect(Math.abs(b.dx)).toBeLessThanOrEqual(5);
        expect(Math.abs(b.dy)).toBeLessThanOrEqual(3);
      }
    }
  });
});
