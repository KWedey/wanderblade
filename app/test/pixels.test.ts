import { describe, expect, it } from 'vitest';
import {
  ALL_SPRITE_MAPS,
  FONT,
  FONT_COVERAGE,
  fontFaults,
  GLYPH_W,
  spriteMapFaults,
  textWidth,
} from '../src/scene/pixels';

describe('sprite grids', () => {
  // A ragged row or an unlegended glyph silently drops pixels at bake time;
  // this is the only place that failure is visible without eyeballing a canvas.
  it.each(Object.keys(ALL_SPRITE_MAPS))('%s is rectangular and fully legended', (name) => {
    expect(spriteMapFaults(name, ALL_SPRITE_MAPS[name]!)).toEqual([]);
  });

  it('covers every exported grid', () => {
    expect(Object.keys(ALL_SPRITE_MAPS).length).toBeGreaterThanOrEqual(14);
  });

  it('gives the hero and his sword a shared 1px outline ink', () => {
    for (const name of ['HERO_WALK_A', 'HERO_WALK_B', 'SWORD']) {
      expect(ALL_SPRITE_MAPS[name]!.legend.o).toBe('outline');
    }
  });

  it('keeps both hero walk frames the same size', () => {
    const a = ALL_SPRITE_MAPS.HERO_WALK_A!;
    const b = ALL_SPRITE_MAPS.HERO_WALK_B!;
    expect(b.rows.length).toBe(a.rows.length);
    expect(b.rows[0]!.length).toBe(a.rows[0]!.length);
  });
});

describe('bitmap font', () => {
  it('has no malformed or missing glyphs', () => {
    expect(fontFaults()).toEqual([]);
  });

  // A missing glyph renders as a hole in the word, not as a blank — "MOMENTUM"
  // came out as "M M T M" the first time this font shipped short of letters.
  it('covers every character in-world text can use', () => {
    for (const ch of FONT_COVERAGE) expect(FONT[ch], `glyph ${ch}`).toBeDefined();
  });

  it('renders a full word with no gaps', () => {
    for (const ch of 'MOMENTUM CATCH') expect(FONT[ch]).toBeDefined();
  });

  it('measures text with single-pixel letter gaps', () => {
    expect(textWidth('', 1)).toBe(0);
    expect(textWidth('7', 1)).toBe(GLYPH_W);
    expect(textWidth('12', 1)).toBe(GLYPH_W * 2 + 1);
    expect(textWidth('12', 3)).toBe((GLYPH_W * 2 + 1) * 3);
  });
});
