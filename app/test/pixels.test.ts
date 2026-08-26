import { describe, expect, it } from 'vitest';
import {
  ALL_SPRITE_MAPS,
  BODY_FONT,
  FONT,
  FONT_COVERAGE,
  GLYPH_W,
  MONSTER_SHAPES,
  NUMERAL_COVERAGE,
  NUMERAL_FONT,
  NUMERAL_GLYPHS,
  fontFaults,
  massProfile,
  type SpriteMap,
  MONSTER_SILHOUETTES,
  sculpt,
  spriteMapFaults,
  textWidth,
  toneBands,
} from '../src/scene/pixels';
import { formatNumber } from '../src/format';
import { formatShort } from '../src/scene/scene';

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
  const BODY_LEGEND = { o: 'outline', b: 'body', B: 'bodyDark', h: 'bodyLight', S: 'bodySpec' };

  it('bands a body by its distance from the light', () => {
    const lit = sculpt({
      rows: ['.......', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.......'],
      legend: BODY_LEGEND,
    });
    // The upper-left contour catches the light; depth grows away from it.
    expect(lit.rows[1]![1]).toBe('S');
    expect(lit.rows[2]![2]).toBe('h');
  });

  // Depth banding alone runs a limb at one value front to back. The flank the
  // form turns away on has to darken, or the creature reads as a flat cutout.
  it('darkens the away flank without eating the lit contour', () => {
    const lit = sculpt({
      rows: ['.......', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.bbbbb.', '.......'],
      legend: BODY_LEGEND,
    });
    expect(lit.rows[5]![5], 'bottom-right of the form').toBe('B');
    expect(lit.rows[3]![5], 'right flank').toBe('B');
    expect(lit.rows[1]![1], 'lit corner keeps its specular').toBe('S');
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

  // The judged failure: "a man standing next to a shrub". A creature shorter
  // than the hero cannot read as his opponent however well it is drawn.
  it('stands at least as tall as the hero', () => {
    const heroH = ALL_SPRITE_MAPS.HERO_WALK_A!.rows.length;
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      expect(map.rows.length, `shape ${i} is shorter than the hero`).toBeGreaterThanOrEqual(heroH);
    }
  });

  it('carries its mass up top rather than pooling at the feet', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      const widths = map.rows.map((row) => [...row].filter((c) => c !== '.').length);
      const half = Math.floor(widths.length / 2);
      const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(widths.slice(0, half)), `shape ${i} is bottom-heavy`).toBeGreaterThan(
        mean(widths.slice(half)),
      );
    }
  });

  // "Legs with visible separation" - a floor-standing mass with one unbroken
  // bottom run is a cone that hangs, not a body that stands.
  it('stands on legs with open air between them', () => {
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      const bottom = map.rows.slice(-Math.max(3, Math.round(map.rows.length * 0.2)));
      const split = bottom.filter((row) => {
        const first = [...row].findIndex((c) => c !== '.');
        const last = row.length - 1 - [...row].reverse().findIndex((c) => c !== '.');
        return first >= 0 && row.slice(first, last + 1).includes('.');
      });
      expect(split.length, `shape ${i} has no leg gap`).toBe(bottom.length);
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

describe('the 3x5 numeral face', () => {
  it('has no ragged or missing glyph', () => {
    expect(fontFaults(NUMERAL_FONT)).toEqual([]);
  });

  // Three columns is barely enough for M against N or 0 against O. Two glyphs
  // with identical bitmaps do not fail any shape check - they just make a
  // payout unreadable, which is the whole reason this face exists.
  it('gives every character a bitmap no other character shares', () => {
    const seen = new Map<string, string>();
    for (const ch of NUMERAL_COVERAGE) {
      if (ch === ' ') continue;
      const key = NUMERAL_GLYPHS[ch]!.join('/');
      const clash = seen.get(key);
      expect(clash, `'${ch}' is drawn identically to '${clash ?? ''}'`).toBeUndefined();
      seen.set(key, ch);
    }
  });

  // drawText advances past a glyph its face lacks, so an uncovered character
  // is a hole in the middle of a payout rather than a visible fallback.
  it('covers every character a real floater can contain', () => {
    const values = [0, 0.1, 0.33, 9.9, 42, 999, Infinity, -Infinity, NaN];
    for (let e = -2; e < 320; e++) for (const m of [1, 1.5, 2.75, 9.99]) values.push(m * 10 ** e);
    const strings = new Set<string>(['UPGRADED']);
    for (const v of values) {
      strings.add(formatShort(v).toUpperCase());
      strings.add(`+${formatShort(v).toUpperCase()}`);
    }
    const missing = new Set<string>();
    for (const text of strings) {
      for (const ch of text) if (!NUMERAL_GLYPHS[ch]) missing.add(ch);
    }
    expect([...missing]).toEqual([]);
  });

  it('names the overflow rather than drawing nothing where it was', () => {
    expect(formatShort(Infinity)).toBe('OVERFLOW');
    expect(formatNumber(Infinity)).toContain('\u221e');
  });

  // The complaint this answers: "55.7dc rendering wider than the hero". A
  // number cannot fit a 14px hero at any legible size, so the bar is the
  // widest creature (30px) plus a glyph of overhang, which still reads as
  // belonging to the thing it floats over. The body face missed it by 22px.
  it('keeps every payout it can actually print inside 32 scene pixels', () => {
    const values = [0, 0.1, 9.9, 42, 999, 999.6];
    for (let e = -2; e < 310; e++) {
      for (const m of [1, 1.5, 2.75, 9.99, 9.999, 9.9999]) values.push(m * 10 ** e);
    }
    let worst = '';
    for (const v of values) {
      const text = `+${formatShort(v).toUpperCase()}`;
      if (text.includes('OVERFLOW')) continue;
      if (textWidth(text, 1, NUMERAL_FONT) > textWidth(worst, 1, NUMERAL_FONT)) worst = text;
    }
    expect(worst.length, 'sweep produced no payout').toBeGreaterThan(1);
    expect(textWidth(worst, 1, NUMERAL_FONT), `widest payout "${worst}"`).toBeLessThanOrEqual(32);
    expect(textWidth(worst, 1, BODY_FONT), `"${worst}" in the body face`).toBeGreaterThan(32);
  });

  it('never prints a fourth significant digit', () => {
    for (let e = 3; e < 300; e++) {
      for (const m of [9.99, 9.999, 9.9999, 1, 5.5]) {
        const digits = formatShort(m * 10 ** e).replace(/[^0-9]/g, '').replace(/^0+/, '');
        expect(digits.length, `${m}e${e} -> ${formatShort(m * 10 ** e)}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('sprite mass profile', () => {
  it('never claims mass wider than the grid or a row that is not in it', () => {
    for (const [name, map] of Object.entries(ALL_SPRITE_MAPS)) {
      const mass = massProfile(map);
      expect(mass.width, name).toBeLessThanOrEqual(map.rows[0]!.length);
      expect(mass.width, name).toBeGreaterThan(0);
      expect(mass.top, name).toBeGreaterThanOrEqual(0);
      expect(mass.top, name).toBeLessThan(map.rows.length);
    }
  });

  // A health bar hung off the bounding box floats on empty air over anything
  // with a horn, an antenna or a raised tail. Thinness is measured by extent,
  // the same way massProfile measures width: counting lit pixels called the
  // golem's two spread shoulder humps an antenna and demanded the bar drop
  // below the very row it belongs on.
  it('starts below the bounding box on every creature with a thin crown', () => {
    for (const [i, map] of MONSTER_SHAPES.entries()) {
      const mass = massProfile(map);
      const row = map.rows[0]!;
      const first = row.search(/[^.]/);
      let last = row.length - 1;
      while (last > first && row[last] === '.') last--;
      const crown = first < 0 ? 0 : last - first + 1;
      if (crown * 2 >= mass.width) continue;
      expect(mass.top, `shape ${i} anchors to its box, not its mass`).toBeGreaterThan(0);
    }
  });

  // The guard above only bites on a creature that has a thin crown, so pin the
  // case outright rather than trusting the roster to keep containing one.
  it('drops the bar below a lone antenna every time', () => {
    const antenna: SpriteMap = {
      rows: ['..#..', '..#..', '..#..', '#####', '#####', '#####'],
      legend: { '#': 'body' },
    };
    expect(massProfile(antenna).top).toBe(3);
  });

  // Sized by lit-pixel count, a golem standing with its legs apart reported a
  // narrower bar than its own shoulders.
  it('measures the widest row by extent, not by how much of it is lit', () => {
    const gapped: SpriteMap = { rows: ['#...#', '.....', '##.##'], legend: { '#': 'body' } };
    expect(massProfile(gapped).width).toBe(5);
  });

  // A bar anchored to the mass must still read as a bar *over* the creature.
  // Half-of-widest could in principle land on a wide belly and bury it.
  it('stays in the top half of every creature', () => {
    for (const [i, map] of MONSTER_SHAPES.entries()) {
      const mass = massProfile(map);
      expect(mass.top * 2, `shape ${i} anchors below its own midline`).toBeLessThan(
        map.rows.length,
      );
    }
  });

  it('anchors on a row that actually has ink in it', () => {
    for (const [i, map] of MONSTER_SHAPES.entries()) {
      const mass = massProfile(map);
      const row = map.rows[mass.top]!;
      expect(row.replace(/\./g, '').length, `shape ${i}`).toBeGreaterThan(0);
    }
  });
});
