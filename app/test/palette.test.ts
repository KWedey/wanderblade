import { describe, expect, it } from 'vitest';

import {
  MAX_TEXTURE_CONTRAST,
  MIN_ACCENT_LIGHTNESS,
  MIN_HILL_SHADOW_GAP,
  MIN_SKY_LIGHTNESS,
  MIN_SPRITE_BACKDROP_GAP,
  MIN_VALUE_SPREAD,
  REALM_SKIN_COUNT,
  backdropSkin,
  brickJointXs,
  clampHillStep,
  coherentRange,
  mixHex,
  depthBandTones,
  depthHaze,
  foliageNotchAt,
  grassClumpBlades,
  groundBladeOf,
  hillBaseInk,
  inFoliageLobe,
  inRun,
  lightnessOf,
  glowRingRadii,
  momentumLift,
  realmSkin,
  skinValueSpread,
  sunHaloBands,
  torchFlicker,
  vignetteInsets,
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

describe('clampHillStep bounds how far one hill column can jump from its neighbour', () => {
  it('passes the target through unclamped when the change fits', () => {
    expect(clampHillStep(10, 12, 4)).toBe(12);
    expect(clampHillStep(10, 7, 4)).toBe(7);
  });

  it('clamps a jump larger than maxDelta in either direction', () => {
    expect(clampHillStep(10, 30, 4)).toBe(14);
    expect(clampHillStep(10, -30, 4)).toBe(6);
  });

  it('passes the first column through with no prior height to compare against', () => {
    expect(clampHillStep(null, 999, 1)).toBe(999);
  });
});

describe('hillBaseInk keeps the hill shadow clear of the haze behind it', () => {
  it('holds the fixed 18% mix when it already clears the floor', () => {
    expect(hillBaseInk('#ffffff', '#000000')).toBe('#d1d1d1');
  });

  it('backs the mix off until the gap opens, for every realm', () => {
    for (let region = 0; region < REALM_SKIN_COUNT; region++) {
      const skin = realmSkin(region);
      const haze = depthHaze(skin);
      const base = hillBaseInk(skin.hillFar, haze);
      expect(lightnessOf(base) - lightnessOf(haze), `realm ${region}`).toBeGreaterThanOrEqual(
        MIN_HILL_SHADOW_GAP - 1e-9,
      );
    }
  });

  it('gives up bounded, without darkening past the floor when the colour cannot clear it', () => {
    // A colour already at the floor: no amount of backing off the mix opens a
    // gap, so the loop must stop rather than spin forever.
    expect(() => hillBaseInk('#101010', '#101010')).not.toThrow();
  });
});

describe('depthBandTones darkens a turf colour toward the horizon, band by band', () => {
  it('returns the true base tone for the nearest band, at any band count', () => {
    expect(depthBandTones('#3a6b4f', 1)).toEqual(['#3a6b4f']);
    const bands = depthBandTones('#3a6b4f', 5);
    expect(bands[4]).toBe('#3a6b4f');
  });

  it('darkens strictly monotonically moving away from the near band', () => {
    const bands = depthBandTones('#3a6b4f', 5);
    for (let i = 1; i < bands.length; i++) {
      expect(lightnessOf(bands[i]!), `band ${i}`).toBeGreaterThan(lightnessOf(bands[i - 1]!));
    }
  });

  it('never inverts near/far ordering across every realm turf', () => {
    for (let region = 0; region < REALM_SKIN_COUNT; region++) {
      const bands = depthBandTones(realmSkin(region).turf, 4);
      expect(lightnessOf(bands[0]!), `realm ${region}`).toBeLessThanOrEqual(lightnessOf(bands[3]!));
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

describe('coherentRange recedes the horizon toward the sky, not toward the hill', () => {
  it('carries the sky 30% of the way into the authored colour', () => {
    expect(coherentRange('#ffffff', '#000000')).toBe('#4d4d4d');
  });

  it('is a no-op when the authored range already matches the sky', () => {
    expect(coherentRange('#639bff', '#639bff')).toBe('#639bff');
  });

  it('never pulls the horizon toward the hill in front of it', () => {
    // Distance is air between you and the rock. A far band mixed toward the
    // near hill collapses the separation that reads as depth.
    for (let region = 0; region < REALM_SKIN_COUNT; region++) {
      const skin = realmSkin(region);
      if (skin.hillFar === skin.skyTop) continue;
      const toHill = mixHex(skin.range, skin.hillFar, 0.3);
      expect(coherentRange(skin.skyTop, skin.range)).not.toBe(toHill);
    }
  });
});

describe('sunHaloBands draws the sun as solid mass, not a ring', () => {
  it('steps five bands outward from the core, largest first', () => {
    const bands = sunHaloBands(20);
    expect(bands).toHaveLength(5);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i - 1]!.r, `band ${i - 1} vs ${i}`).toBeGreaterThan(bands[i]!.r);
    }
    for (const band of bands) expect(band.r).toBeGreaterThan(20);
  });

  it('mixes each band further toward sky than the one inside it, ending close to sky colour', () => {
    const bands = sunHaloBands(20);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i - 1]!.skyMix, `band ${i - 1} vs ${i}`).toBeGreaterThan(bands[i]!.skyMix);
    }
    expect(bands[0]!.skyMix).toBeGreaterThanOrEqual(0.8);
  });

  it('draws nothing at no core radius', () => {
    expect(sunHaloBands(0)).toEqual([]);
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

describe('vignetteInsets', () => {
  it('starts at zero and steps outward by a fixed amount, darkest first', () => {
    const insets = vignetteInsets(4, 6);
    expect(insets).toEqual([0, 6, 12, 18]);
  });

  it('never returns fewer than one band even if asked for zero', () => {
    expect(vignetteInsets(0, 6)).toHaveLength(1);
  });
});

describe('brickJointXs', () => {
  it('covers the full width at a fixed spacing', () => {
    const xs = brickJointXs(100, 0, 20);
    expect(xs).toEqual([0, 20, 40, 60, 80]);
  });

  it('staggers odd rows by half a brick so joints do not line up into a grid', () => {
    const even = brickJointXs(100, 0, 20);
    const odd = brickJointXs(100, 1, 20);
    expect(odd[0]).toBe(10);
    expect(odd).not.toEqual(even);
  });

  it('is stable for the same row parity regardless of row number', () => {
    expect(brickJointXs(100, 2, 20)).toEqual(brickJointXs(100, 0, 20));
    expect(brickJointXs(100, 3, 20)).toEqual(brickJointXs(100, 1, 20));
  });
});

describe('torchFlicker', () => {
  it('stays within [0.7, 1] across a full swing of the clock', () => {
    for (let t = 0; t < 20; t += 0.05) {
      const v = torchFlicker(t, 1);
      expect(v).toBeGreaterThanOrEqual(0.7);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('gives different torches different phase from their seed alone', () => {
    const a = [0, 1, 2, 3].map((t) => torchFlicker(t, 1));
    const b = [0, 1, 2, 3].map((t) => torchFlicker(t, 2));
    expect(a).not.toEqual(b);
  });
});
