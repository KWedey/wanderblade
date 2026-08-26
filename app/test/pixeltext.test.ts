import { describe, expect, it } from 'vitest';

import { FONT_COVERAGE, GLYPH_H } from '../src/scene/pixels';
import { measurePixelText, pixelScaleFor, unsupported } from '../src/pixeltext';

describe('pixelScaleFor', () => {
  it('is always an integer of at least one', () => {
    for (let size = 1; size <= 96; size++) {
      const scale = pixelScaleFor(size);
      expect(Number.isInteger(scale)).toBe(true);
      expect(scale).toBeGreaterThanOrEqual(1);
    }
  });

  it('grows with the CSS size and matches the glyph cell', () => {
    expect(pixelScaleFor(GLYPH_H)).toBe(1);
    expect(pixelScaleFor(GLYPH_H * 2)).toBe(2);
    expect(pixelScaleFor(GLYPH_H * 3)).toBe(3);
  });
});

describe('unsupported', () => {
  it('reports nothing for the declared coverage', () => {
    expect(unsupported(FONT_COVERAGE)).toEqual([]);
  });

  it('covers the strings the panel actually renders', () => {
    const panelStrings = [
      'Hero Lv 4968',
      'Level up your blade',
      'Unlocks at Level 5',
      'THE PORTAL STANDS OPEN',
      'the Warden of the Beyond',
      'Enter the Portal',
      'The realm ascends',
      'Runed Longsword',
      'Dragon-Eye Amulet',
      'power 14.0dc',
      'Felled a Thornback Lynx - +34 gold',
      'Portal reached',
      "World's Edge 23",
      'Level 10 · MAX',
      'Zone 3/8',
      '106.375cs',
      'ESTIMATED',
      'ON VICTORY',
      '32s',
      '1.61K leagues',
    ];
    for (const s of panelStrings) {
      expect(unsupported(s), `"${s}"`).toEqual([]);
    }
  });

  it('flags a character the font lacks so the caller can fall back', () => {
    expect(unsupported('naïve')).toEqual(['ï']);
  });
});

describe('measurePixelText', () => {
  it('scales linearly and matches the glyph cell height', () => {
    const one = measurePixelText('ABC', 1);
    const two = measurePixelText('ABC', 2);
    expect(two.width).toBe(one.width * 2);
    expect(one.height).toBe(GLYPH_H);
    expect(two.height).toBe(GLYPH_H * 2);
  });

  it('is zero-width for an empty string', () => {
    expect(measurePixelText('', 2).width).toBe(0);
  });
});
