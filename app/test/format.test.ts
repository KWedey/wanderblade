// Boundary tests for the odometer/rate formatters. These pin every display
// band so a future toFixed/threshold tweak fails loudly instead of silently
// corrupting the most-visible element on screen.

import { describe, expect, it } from 'vitest';
import { formatGold, formatRate } from '../src/format';

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

  it('covers the last suffix and falls back to exponential beyond the table', () => {
    expect(formatGold(1e39)).toBe('1.00000Dd');
    expect(formatGold(1e42)).toBe('1.0000e+42');
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
