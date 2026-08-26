import { describe, expect, it } from 'vitest';
import {
  ALL_SPRITE_MAPS,
  FONT,
  FONT_COVERAGE,
  GLYPH_W,
  MONSTER_SHAPES,
  fontFaults,
  MONSTER_SILHOUETTES,
  sculpt,
  spriteMapFaults,
  textWidth,
  toneBands,
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

describe('sculpt', () => {
  it('bands a body by its distance from the light', () => {
    const lit = sculpt({
      rows: ['.....', '.bbb.', '.bbb.', '.bbb.', '.....'],
      legend: { o: 'outline', b: 'body', B: 'bodyDark', h: 'bodyLight', S: 'bodySpec' },
    });
    // The upper-left contour catches the light; depth grows away from it.
    expect(lit.rows[1]![1]).toBe('S');
    expect(lit.rows[2]![2]).toBe('h');
  });

  it('keeps the authored silhouette and only adds ink around it', () => {
    for (const [i, authored] of MONSTER_SILHOUETTES.entries()) {
      const lit = MONSTER_SHAPES[i]!;
      expect(lit.rows.length, `shape ${i}`).toBe(authored.rows.length);
      authored.rows.forEach((row, y) => {
        [...row].forEach((cell, x) => {
          // Every authored pixel stays filled; empties may become outline.
          if (cell !== '.') expect(lit.rows[y]![x], `shape ${i} @${x},${y}`).not.toBe('.');
        });
      });
      expect(spriteMapFaults(`shape ${i}`, lit)).toEqual([]);
    }
  });
});

// VISION.md pillar 2 is "vibrant and dangerous". A critic read the roster as
// "perfect circles, single flat pastel fill, uniform 1px outline, no shading,
// no shadow, facing nowhere" - these are that note turned into assertions.
describe('creatures read as dangerous', () => {
  it('gives every creature three tone bands and a specular edge', () => {
    for (const [i, map] of MONSTER_SHAPES.entries()) {
      const bands = toneBands(map);
      expect(bands, `shape ${i}`).toContain('S');
      expect(bands.length, `shape ${i}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('varies outline weight instead of ringing every creature uniformly', () => {
    for (const [i, map] of MONSTER_SHAPES.entries()) {
      const rows = map.rows;
      const filled = (x: number, y: number): boolean => {
        const c = rows[y]?.[x];
        return c !== undefined && c !== '.' && c !== 'o';
      };
      // A lit contour is separated by its own specular, so somewhere on each
      // creature a body pixel must meet open air with no outline between.
      let bare = 0;
      rows.forEach((row, y) => {
        [...row].forEach((cell, x) => {
          if (cell !== '.') return;
          if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
            bare++;
          }
        });
      });
      expect(bare, `shape ${i} is uniformly outlined`).toBeGreaterThan(0);
    }
  });

  // A blob is convex: every row is one unbroken run. Limbs that read as limbs
  // put open air between themselves and the torso.
  it('separates limbs from the body with real negative space', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      let gapRows = 0;
      for (const row of map.rows) {
        const first = [...row].findIndex((c) => c !== '.');
        const last = row.length - 1 - [...row].reverse().findIndex((c) => c !== '.');
        if (first < 0) continue;
        if (row.slice(first, last + 1).includes('.')) gapRows++;
      }
      expect(gapRows, `shape ${i} is convex - no limb separation`).toBeGreaterThanOrEqual(3);
    }
  });

  it('varies its width down the body rather than tapering like a droplet', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      const widths = map.rows
        .map((row) => [...row].filter((c) => c !== '.').length)
        .filter((n) => n > 0);
      expect(new Set(widths).size, `shape ${i} width is too uniform`).toBeGreaterThanOrEqual(5);
    }
  });

  it('is asymmetric, so no creature reads as a circle', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      const mirrored = map.rows.map((r) => [...r].reverse().join(''));
      expect(mirrored, `shape ${i} is mirror-symmetric`).not.toEqual(map.rows);
    }
  });

  it('carries a jaw and a lit eye on every creature', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      const flat = map.rows.join('');
      expect(flat, `shape ${i} has no lit eye`).toContain('E');
      expect(flat, `shape ${i} has no bared tooth`).toContain('t');
    }
  });
});
