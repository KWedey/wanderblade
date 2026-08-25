import { describe, expect, it } from 'vitest';

import { BAYER, ditherAt, falloff, momentumLift, ringFalloff } from '../src/scene/light';

describe('ditherAt', () => {
  it('paints nothing at zero and everything at one', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(ditherAt(x, y, 0)).toBe(false);
        expect(ditherAt(x, y, 1)).toBe(true);
      }
    }
  });

  it('paints a rising share of the 4x4 cell as level rises', () => {
    const share = (level: number): number => {
      let n = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherAt(x, y, level)) n++;
      return n;
    };
    expect(share(0.25)).toBeLessThan(share(0.5));
    expect(share(0.5)).toBeLessThan(share(0.75));
    expect(share(0.5)).toBe(8);
  });

  it('is stable under negative coordinates', () => {
    expect(ditherAt(-1, -1, 0.5)).toBe(ditherAt(3, 3, 0.5));
  });

  it('uses all sixteen Bayer levels exactly once', () => {
    expect([...BAYER].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
  });
});

describe('falloff', () => {
  it('is brightest at the centre and zero at the rim', () => {
    expect(falloff(0, 10)).toBe(1);
    expect(falloff(10, 10)).toBe(0);
    expect(falloff(5, 10)).toBeCloseTo(0.5);
  });

  it('is zero for a degenerate radius', () => {
    expect(falloff(0, 0)).toBe(0);
  });
});

describe('ringFalloff', () => {
  it('peaks on the ring, not at the centre', () => {
    expect(ringFalloff(8, 8, 3)).toBe(1);
    expect(ringFalloff(0, 8, 3)).toBe(0);
    expect(ringFalloff(11, 8, 3)).toBe(0);
  });
});

describe('momentumLift', () => {
  it('is zero at rest and clamped at full', () => {
    expect(momentumLift(0)).toBe(0);
    expect(momentumLift(1)).toBeCloseTo(0.22);
    expect(momentumLift(3)).toBeCloseTo(0.22);
  });
});
