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
  BOSS_SHAPE,
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

  // Eleven rounds of frames shipped "9old", "UPgrades" and "Arnor" past a green
  // gate, because the only font assertion was that a glyph is *defined*. Every
  // broken character was defined. These are about what the glyph looks like.
  describe('lowercase is lowercase', () => {
    const topRow = (ch: string): number => FONT[ch]!.findIndex((r) => r.includes('#'));
    /** Letters entitled to reach the cap line: risers and the two dotted ones. */
    const TALL = new Set('bdfhijklt');
    const XHEIGHT = [...'acegmnopqrsuvwxyz'].filter((ch) => !TALL.has(ch));

    // g and p sat at row 1 - one row off the cap line - so g was a 9 with a
    // different tail and p was a capital P. Nothing about them said "small".
    it('starts every x-height letter below the cap line', () => {
      for (const ch of XHEIGHT) {
        expect(topRow(ch), `'${ch}' starts at the cap line`).toBeGreaterThanOrEqual(2);
      }
    });

    it('draws each one strictly shorter than its own capital', () => {
      for (const ch of XHEIGHT) {
        const upper = ch.toUpperCase();
        expect(topRow(ch), `'${ch}' is as tall as '${upper}'`).toBeGreaterThan(topRow(upper));
      }
    });

    // The literal shipped defect: a descender-less g in a 5x7 cell is a 9.
    it('never draws a letter as one of the digits', () => {
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
        for (const digit of '0123456789') {
          expect(
            FONT[ch]!.join('/'),
            `'${ch}' is drawn identically to '${digit}'`,
          ).not.toBe(FONT[digit]!.join('/'));
        }
      }
    });

    // Two characters drawn identically fail no shape check; they just make a
    // word unreadable, which is the whole reason this face is hand-authored.
    it('draws no two characters the same', () => {
      const seen = new Map<string, string>();
      for (const [ch, rows] of Object.entries(FONT)) {
        if (ch === ' ') continue;
        const key = rows.join('/');
        const clash = seen.get(key);
        expect(clash, `'${ch}' is drawn identically to '${clash ?? ''}'`).toBeUndefined();
        seen.set(key, ch);
      }
    });

    /** Marks in a glyph, counting a diagonal touch as joined. */
    const marks = (rows: readonly string[]): number => {
      const seen = rows.map((r) => [...r].map(() => false));
      let found = 0;
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y]!.length; x++) {
          if (rows[y]![x] !== '#' || seen[y]![x]) continue;
          found++;
          const stack: number[][] = [[y, x]];
          while (stack.length > 0) {
            const [cy, cx] = stack.pop()!;
            if (rows[cy!]?.[cx!] !== '#' || seen[cy!]![cx!]) continue;
            seen[cy!]![cx!] = true;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) stack.push([cy! + dy, cx! + dx]);
            }
          }
        }
      }
      return found;
    };

    /** Characters drawn as more than one mark on purpose, and how many. */
    const DOTTED: Record<string, number> = { i: 2, j: 2, '!': 2, ':': 2, '%': 3, '=': 2, '"': 2 };

    // The shipped defect that "does it exist", "is it unique" and "is it short
    // enough" all waved through: g's tail sat two columns clear of its own
    // stem. The stem then read as a 9's and the tail as a stray dash. A
    // floating piece is the structural difference, not the shape.
    it('draws every glyph as one connected mark', () => {
      for (const [ch, rows] of Object.entries(FONT)) {
        if (ch === ' ') continue;
        expect(marks(rows), `'${ch}' is drawn as several disconnected pieces`).toBe(DOTTED[ch] ?? 1);
      }
    });

    // The two it was actually read as on screen. The pairwise sweep above
    // covers them, but a reader confuses this pair specifically, so it fails
    // by name instead of as one row of a loop.
    it('keeps g clear of the s and the 9 it has been read as', () => {
      expect(FONT['g']!.join('/'), 'g is drawn as s').not.toBe(FONT['s']!.join('/'));
      expect(FONT['g']!.join('/'), 'g is drawn as 9').not.toBe(FONT['9']!.join('/'));
      // The tail has to leave the stem, not merely exist: a descender that
      // drops straight down is a q. A critic reading at native size called the
      // first fix "a flat closed bowl and no visible ear" — connected was
      // necessary and not sufficient.
      const stemCol = (row: string): number => row.lastIndexOf('#');
      const g = FONT['g']!;
      expect(g.at(-1)!.indexOf('#'), "g's tail never leaves its stem").toBeLessThan(
        stemCol(g.at(-2)!),
      );
      // And the bowl has to be a bowl: two rows of enclosed counter, so it
      // reads as round rather than as a bar with a slot in it.
      const counters = g.filter((row) => /^#[^#]*#$/.test(row)).length;
      expect(counters, 'g has no round bowl').toBeGreaterThanOrEqual(2);
    });

    // "Armor" read as "Arnor": m's middle stem stopped two rows above the
    // baseline, so the glyph fell apart into r + n at panel scale.
    it('carries all three of m\'s stems down to the baseline', () => {
      const baseline = FONT['m']!.at(-1)!;
      expect(baseline, 'm loses a stem before the baseline').toBe('#.#.#');
    });
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

  // The other half of the same complaint, and the half that had no guard: "Hero
  // is a ~12px sprite; the wolf he is fighting is ~24px. He reads as a child
  // next to it." A floor alone lets every mob drift upward and leave the hero
  // behind, which is what happened. The hero is the scale the road is measured
  // against, so road mobs are bounded on both sides; only the guardian towers.
  it('never towers over the hero — the guardian alone is allowed to', () => {
    const heroH = ALL_SPRITE_MAPS.HERO_WALK_A!.rows.length;
    for (const [i, map] of MONSTER_SILHOUETTES.entries()) {
      if (i === BOSS_SHAPE) continue;
      expect(
        map.rows.length / heroH,
        `shape ${i} is ${(map.rows.length / heroH).toFixed(2)}x the hero`,
      ).toBeLessThanOrEqual(1.2);
    }
    const boss = MONSTER_SILHOUETTES[BOSS_SHAPE]!;
    expect(boss.rows.length / heroH, 'the guardian does not tower').toBeGreaterThan(1.4);
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
