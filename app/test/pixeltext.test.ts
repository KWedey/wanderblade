import { describe, expect, it } from 'vitest';

import { FONT_COVERAGE, GLYPH_H, textWidth } from '../src/scene/pixels';
import {
  alignOffset,
  layoutPixelText,
  LINE_GAP,
  lineHeight,
  measurePixelText,
  pixelScaleFor,
  unsupported,
  wrapPixelText,
} from '../src/pixeltext';

/** Every string the panel is known to render, longest realm names included. */
const PANEL_STRINGS = [
  'Hero Lv 4968',
  'Level up your blade',
  'Unlocks at Level 5',
  'THE PORTAL STANDS OPEN',
  'the Warden of the Beyond',
  'the Warden of the Beyond awaits',
  'Enter the Portal',
  'The realm ascends',
  'Runed Longsword',
  'Dragonfang Greatsword',
  'Dragonscale Hauberk',
  'Dragon-Eye Amulet',
  'power 14.0dc',
  'Felled a Thornback Lynx - +34 gold',
  'Felled a Nameless Horror - +8.94cr gold',
  'Portal reached',
  "World's Edge 23",
  'Level 10 · MAX',
  'Zone 3/8',
  '106.375cs',
  'ESTIMATED',
  'ON VICTORY',
  '26m 57s',
  '32s',
  '1.61K leagues',
  'COMBO ×2.1',
];

/** Container widths from the narrowest phone column to a desktop panel. */
const BOX_WIDTHS = [40, 60, 80, 100, 120, 160, 200, 240, 320, 400, 520];

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
    for (const s of PANEL_STRINGS) {
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

describe('wrapPixelText', () => {
  it('keeps a string that already fits on one line', () => {
    expect(wrapPixelText('Enter the Portal', 1, 1000)).toEqual(['Enter the Portal']);
  });

  it('breaks on whitespace, never mid-word', () => {
    const lines = wrapPixelText('the Warden of the Beyond', 2, 90);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('the Warden of the Beyond');
    for (const line of lines) expect(line.trim()).toBe(line);
  });

  it('collapses runs of whitespace rather than emitting empty lines', () => {
    expect(wrapPixelText('  a   b  ', 1, 1000)).toEqual(['a b']);
  });
});

// The bug this guards: a canvas glyph run wider than its container clipped at
// the panel edge, shipping "the Warden of the Beyo" in a judged frame.
describe('layoutPixelText never clips', () => {
  it('fits every panel string inside every container width', () => {
    for (const text of PANEL_STRINGS) {
      for (const box of BOX_WIDTHS) {
        for (const preferred of [1, 2, 3, 4, 5]) {
          const layout = layoutPixelText(text, preferred, box);
          if (!layout) continue;
          expect(layout.width, `"${text}" @ ${box}px`).toBeLessThanOrEqual(box);
          for (const line of layout.lines) {
            expect(textWidth(line, layout.scale), `line "${line}" @ ${box}px`).toBeLessThanOrEqual(
              box,
            );
          }
        }
      }
    }
  });

  it('drops scale rather than overflow, and never above the preferred scale', () => {
    const wide = layoutPixelText('Dragonfang', 4, 1000);
    const tight = layoutPixelText('Dragonfang', 4, 70);
    expect(wide?.scale).toBe(4);
    expect(tight).not.toBeNull();
    expect(tight!.scale).toBeLessThan(4);
  });

  it('returns null when even 1x cannot fit, so the caller keeps DOM text', () => {
    expect(layoutPixelText('Dragonfang', 3, 8)).toBeNull();
    expect(layoutPixelText('anything', 3, 0)).toBeNull();
    expect(layoutPixelText('   ', 3, 500)).toBeNull();
  });

  it('preserves the text exactly across the wrap', () => {
    for (const text of PANEL_STRINGS) {
      const layout = layoutPixelText(text, 3, 120);
      if (!layout) continue;
      expect(layout.lines.join(' ')).toBe(text.trim().replace(/\s+/g, ' '));
    }
  });
});

// The other half of the shipped garble: glyph rows from two lines landing on
// the same pixels, which reads as overlapping nonsense rather than two lines.
describe('layoutPixelText never overlaps itself', () => {
  it('separates every wrapped line by at least the glyph height', () => {
    for (const text of PANEL_STRINGS) {
      for (const box of BOX_WIDTHS) {
        const layout = layoutPixelText(text, 4, box);
        if (!layout || layout.lines.length < 2) continue;
        const step = lineHeight(layout.scale);
        expect(step, `"${text}" @ ${box}px`).toBeGreaterThanOrEqual(GLYPH_H * layout.scale);
        const declared = layout.lines.length * step - LINE_GAP * layout.scale;
        expect(layout.height).toBe(declared);
      }
    }
  });

  it('reports a height that covers every line it will draw', () => {
    const layout = layoutPixelText('the Warden of the Beyond awaits', 3, 100);
    expect(layout).not.toBeNull();
    const lastLineBottom = (layout!.lines.length - 1) * lineHeight(layout!.scale) + GLYPH_H * layout!.scale;
    expect(layout!.height).toBeGreaterThanOrEqual(lastLineBottom);
  });
});

describe('alignOffset', () => {
  it('keeps every alignment inside the box', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const offset = alignOffset(40, 100, align);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + 40).toBeLessThanOrEqual(100);
    }
  });

  it('pins left, centres, and pins right', () => {
    expect(alignOffset(40, 100, 'left')).toBe(0);
    expect(alignOffset(40, 100, 'center')).toBe(30);
    expect(alignOffset(40, 100, 'right')).toBe(60);
  });
});
