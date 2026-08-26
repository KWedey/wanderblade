import { REGION_NAME_COUNT, regionName } from '../src/flavor';
import { REALM_SKIN_COUNT } from '../src/scene/palette';
// Boundary tests for the odometer/rate formatters. These pin every display
// band so a future toFixed/threshold tweak fails loudly instead of silently
// corrupting the most-visible element on screen.

import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  NO_ESTIMATE,
  formatGold,
  formatNumber,
  formatRate,
  suffixFor,
} from '../src/format';

describe('formatGold', () => {
  it('renders one decimal under 1K so the tail churns at low scale', () => {
    expect(formatGold(0)).toBe('0.0');
    expect(formatGold(0.5)).toBe('0.5');
    expect(formatGold(42.7)).toBe('42.7');
    expect(formatGold(999)).toBe('999.0');
    expect(formatGold(999.94)).toBe('999.9');
  });

  it('never prints "1000.0" at the top of the decimal band (rounds into "1,000")', () => {
    expect(formatGold(999.97)).toBe('1,000');
    expect(formatGold(999.95)).toBe('1,000');
  });

  it('renders full separator digits from 1K to 1M', () => {
    expect(formatGold(1000)).toBe('1,000');
    expect(formatGold(12847)).toBe('12,847');
    expect(formatGold(999999.9)).toBe('999,999');
  });

  it('renders ~6 significant figures with a suffix at 1M and above', () => {
    expect(formatGold(1_000_000)).toBe('1.00000M');
    expect(formatGold(1_234_567)).toBe('1.23457M');
    expect(formatGold(123_456_789)).toBe('123.457M');
  });

  it('promotes the tier at the mantissa round-up band instead of printing "1000.000M"', () => {
    expect(formatGold(999_999_999)).toBe('1.00000B');
    expect(formatGold(999_999_999_999)).toBe('1.00000T');
  });

  it('keeps a suffix past the old table instead of dropping to exponential', () => {
    expect(formatGold(1e39)).toBe('1.00000Dd');
    expect(formatGold(1e42)).toBe('1.00000Td');
  });

  it('handles negatives and non-finite values', () => {
    expect(formatGold(-1500)).toBe('-1,500');
    expect(formatGold(Number.NaN)).toBe('∞');
    expect(formatGold(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatGold(Number.NEGATIVE_INFINITY)).toBe('∞');
  });
});

describe('formatRate', () => {
  it('uses one decimal below 100/s', () => {
    expect(formatRate(0)).toBe('+0.0/s');
    expect(formatRate(0.5)).toBe('+0.5/s');
    expect(formatRate(12.4)).toBe('+12.4/s');
    expect(formatRate(99.9)).toBe('+99.9/s');
  });

  it('switches to compact formatting at 100/s', () => {
    expect(formatRate(100)).toBe('+100/s');
    expect(formatRate(1234)).toBe('+1.23K/s');
  });

  it('handles non-finite rates', () => {
    expect(formatRate(Number.NaN)).toBe('∞');
    expect(formatRate(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});

describe('suffixFor', () => {
  it('covers the named ladder', () => {
    expect(suffixFor(0)).toBe('');
    expect(suffixFor(1)).toBe('K');
    expect(suffixFor(21)).toBe('Vg');
  });

  it('rolls into letter pairs past the named ladder', () => {
    expect(suffixFor(22)).toBe('aa');
    expect(suffixFor(23)).toBe('ab');
    expect(suffixFor(48)).toBe('ba');
  });

  it('reaches the tiers a staged late run actually produces', () => {
    expect(suffixFor(92)).not.toBeNull();
    expect(formatNumber(1.0637e278)).not.toMatch(/e\+/);
    expect(formatGold(9.46e307)).not.toMatch(/e\+/);
  });

  it('rejects a tier past two letters rather than inventing one', () => {
    expect(suffixFor(22 + 26 * 26)).toBeNull();
  });
});

describe('formatDuration overflow', () => {
  it('does not render NaN or Infinity as a duration', () => {
    expect(formatDuration(Number.NaN)).toBe(NO_ESTIMATE);
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe(NO_ESTIMATE);
  });

  // Deep realms overflow boss HP past a double. A bare dash under "Estimated"
  // read as an empty field rather than as a value the game cannot know.
  it('says something a player can read, not a placeholder glyph', () => {
    expect(NO_ESTIMATE.length).toBeGreaterThan(1);
    expect(NO_ESTIMATE).toMatch(/^[a-z ]+$/);
  });
});

describe('in-world floater ladder', () => {
  it('never prints a raw exponential at any scale the game reaches', () => {
    for (const n of [0.4, 9.9, 42, 999, 1e4, 1e12, 1e42, 2.5866e295, 9.4e307]) {
      expect(formatNumber(n)).not.toMatch(/[eE]\+/);
    }
  });
});

describe('region naming', () => {
  it('stays index-aligned with the scene skins', () => {
    expect(REGION_NAME_COUNT).toBe(REALM_SKIN_COUNT);
  });

  it('names the biome the skin is actually showing, on every lap', () => {
    for (let region = 0; region < 400; region++) {
      const name = regionName(region);
      const biome = regionName(region % REALM_SKIN_COUNT);
      expect(name.startsWith(biome), `realm ${region}: "${name}" vs "${biome}"`).toBe(true);
    }
  });

  it('does not label a later lap as if it were the first', () => {
    expect(regionName(0)).toBe('Greenwood');
    expect(regionName(REALM_SKIN_COUNT)).toBe('Greenwood II');
    expect(regionName(REALM_SKIN_COUNT * 2)).toBe('Greenwood III');
  });

  it('never emits the old generic name over a specific skin', () => {
    for (let region = 0; region < 400; region++) {
      expect(regionName(region)).not.toContain('Beyond the Edge');
    }
  });
});
