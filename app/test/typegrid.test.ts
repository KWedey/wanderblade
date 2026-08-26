import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GLYPH_H, textWidth } from '../src/scene/pixels';
import { lineHeight, pixelScaleFor, wrapPixelText } from '../src/pixeltext';

/** Comments stripped: a rule's selector is whatever precedes its brace, and a
 *  comment sitting in front of one made it stop matching. */
const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const RAMP = ['--ui-1', '--ui-2', '--ui-3', '--num-1', '--num-2', '--num-3', '--num-4'] as const;

interface Viewport {
  name: string;
  w: number;
  h: number;
}

/** Real devices, not round numbers: each one is a layout the game has to hold. */
const VIEWPORTS: Viewport[] = [
  { name: 'iPhone portrait', w: 390, h: 844 },
  { name: 'iPhone landscape', w: 844, h: 390 },
  { name: 'iPad portrait', w: 768, h: 1024 },
  { name: 'laptop', w: 1280, h: 800 },
  { name: 'judged desktop', w: 1920, h: 1080 },
];

/** Panel padding, both sides — `.screen` sets 12px of it. */
const PANEL_PAD = 24;
/** The widest the gold total ever gets before the HUD's suffix kicks in. */
const WIDEST_NUMBER = '344.652B';
/** The upgrade row that wrapped to five lines on a landscape phone. */
const WIDEST_ROW_LABEL = 'Level up your blade';
/** The price beside it, and the gap the grid puts between the two. */
const WIDEST_PRICE = '29.4B g';
const ROW_GAP = 10;
const ROW_PAD = 24;
/** A road-log entry at its longest, and the three the panel promises to show. */
const LOG_LINE = 'Felled a Thornback Lynx - +220M gold';
const LOG_ENTRIES = 3;
const LOG_GAP = 4;

// --- Enough of a CSS engine to answer "what applies at this size" ----------

function mediaMatches(query: string, vp: Viewport): boolean {
  // Anything keyed on a user preference rather than a size is never the
  // condition under test here, and must not silently pull its block in.
  if (/prefers-/.test(query)) return false;
  const ratio = vp.w / vp.h;
  for (const [, kind, value] of query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g) as Iterable<
    RegExpMatchArray
  >) {
    const px = Number(value);
    if (kind === 'min' ? vp.w < px : vp.w > px) return false;
  }
  for (const [, kind, num, den] of query.matchAll(
    /\((min|max)-aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\)/g,
  ) as Iterable<RegExpMatchArray>) {
    const want = Number(num) / Number(den);
    if (kind === 'min' ? ratio < want : ratio > want) return false;
  }
  return true;
}

/**
 * Every `{ ... }` block for `selector`, in source order, that applies at `vp`.
 * Walks braces rather than matching a prefix: a rule is rarely the first one
 * inside its `@media`, and pattern-matching one silently promoted the
 * landscape panel width into portrait.
 */
function blocksFor(selector: string, vp: Viewport): string[] {
  const out: string[] = [];
  const media: boolean[] = [];
  let i = 0;
  while (i < CSS.length) {
    const open = CSS.indexOf('{', i);
    const close = CSS.indexOf('}', i);
    if (open < 0 && close < 0) break;
    if (close >= 0 && (open < 0 || close < open)) {
      media.pop();
      i = close + 1;
      continue;
    }
    const head = CSS.slice(i, open).trim();
    if (head.startsWith('@')) {
      media.push(!head.startsWith('@media') || mediaMatches(head, vp));
      i = open + 1;
      continue;
    }
    const end = CSS.indexOf('}', open);
    const body = CSS.slice(open + 1, end < 0 ? CSS.length : end);
    const selects = head
      .split(',')
      .map((s) => s.trim())
      .includes(selector);
    if (selects && media.every(Boolean)) out.push(body);
    i = (end < 0 ? CSS.length : end) + 1;
  }
  return out;
}

/** Last declaration wins, the way the cascade resolves it. */
function declared(selector: string, prop: string, vp: Viewport): string | null {
  let found: string | null = null;
  for (const block of blocksFor(selector, vp)) {
    const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(block);
    if (m) found = m[1]!.trim();
  }
  return found;
}

function rampAt(vp: Viewport): Map<string, number> {
  const out = new Map<string, number>();
  for (const token of RAMP) {
    const value = declared(':root', token, vp);
    expect(value, `${token} is not defined at ${vp.name}`).not.toBeNull();
    out.set(token, Number(/^([\d.]+)px$/.exec(value!)?.[1]));
  }
  return out;
}

/** Resolves one `var(--token)` hop, then `min(Npx, Mvw)`, to CSS pixels. */
function lengthAt(raw: string, vp: Viewport): number {
  const token = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw.trim());
  if (token) {
    const value = declared(':root', token[1]!, vp);
    expect(value, `${token[1]} is not defined at ${vp.name}`).not.toBeNull();
    return lengthAt(value!, vp);
  }
  const capped = /min\(\s*(\d+)px\s*,\s*(\d+)vw\s*\)/.exec(raw);
  if (capped) return Math.min(Number(capped[1]), (Number(capped[2]) / 100) * vp.w);
  const px = /^([\d.]+)px$/.exec(raw.trim());
  return px ? Number(px[1]) : vp.w;
}

/** Content width of the panel — the docked column in landscape, full width otherwise. */
function panelWidth(vp: Viewport): number {
  return lengthAt(declared('.screen', 'width', vp) ?? '100%', vp) - PANEL_PAD;
}

/** True when the panel is docked beside the world rather than under it. */
function docked(vp: Viewport): boolean {
  return (declared('.screen', 'width', vp) ?? '100%') !== '100%';
}

describe('the panel type grid', () => {
  it('resolves a different ramp on a phone than on the judged desktop', () => {
    const phone = rampAt(VIEWPORTS[0]!);
    const desktop = rampAt(VIEWPORTS.at(-1)!);
    expect([...RAMP].some((t) => phone.get(t) !== desktop.get(t))).toBe(true);
  });

  // A size that is not an exact multiple of the cell height rounds to a scale,
  // so two different sizes silently collapse onto one and the ramp stops
  // meaning what it says.
  for (const vp of VIEWPORTS) {
    it(`sizes every step to a whole number of glyph cells at ${vp.name}`, () => {
      for (const [token, px] of rampAt(vp)) {
        expect(px % GLYPH_H, `${token} is not a multiple of the ${GLYPH_H}px cell`).toBe(0);
        expect(pixelScaleFor(px) * GLYPH_H, `${token} rounds to a different scale`).toBe(px);
        expect(pixelScaleFor(px), `${token} is sub-pixel`).toBeGreaterThanOrEqual(2);
      }
    });

    // The landscape-phone break: a 287px panel wearing type sized for 452px.
    // The gold total ran wider than the box it sits in and the upgrade rows
    // wrapped to five lines.
    it(`fits the widest number and the widest row label at ${vp.name}`, () => {
      const ramp = rampAt(vp);
      const box = panelWidth(vp);
      const hero = Math.max(ramp.get('--num-3')!, ramp.get('--num-4')!, ramp.get('--ui-3')!);
      expect(
        textWidth(WIDEST_NUMBER, pixelScaleFor(hero)),
        `"${WIDEST_NUMBER}" at ${hero}px overruns a ${box}px panel`,
      ).toBeLessThanOrEqual(box);
      expect(
        textWidth(WIDEST_ROW_LABEL, pixelScaleFor(ramp.get('--ui-1')!)),
        `"${WIDEST_ROW_LABEL}" wraps in a ${box}px panel`,
      ).toBeLessThanOrEqual(box);
    });
  }

  // The bar the panel was ranked #1 on, and the one a type change regressed
  // once already: the Hero Lv row must not wrap and the log must show three
  // whole entries. Held at every width rather than at the one it was tuned on.
  for (const vp of VIEWPORTS) {
    it(`keeps the Hero Lv row on one line at ${vp.name}`, () => {
      const ramp = rampAt(vp);
      const areas = declared('.upgrade-btn', 'grid-template-areas', vp) ?? '';
      const sharesRow = /name\s+cost/.test(areas);
      const price = sharesRow
        ? textWidth(WIDEST_PRICE, pixelScaleFor(ramp.get('--num-1')!)) + ROW_GAP
        : 0;
      const nameBox = panelWidth(vp) - ROW_PAD - price;
      expect(
        textWidth(WIDEST_ROW_LABEL, pixelScaleFor(ramp.get('--ui-1')!)),
        `"${WIDEST_ROW_LABEL}" wraps in a ${nameBox}px name column`,
      ).toBeLessThanOrEqual(nameBox);
    });

    it(`shows three whole road-log entries at ${vp.name}`, () => {
      const scale = pixelScaleFor(rampAt(vp).get('--ui-1')!);
      const cap = Number(/max-height:\s*(\d+)px;/.exec(blocksFor('.log-list', vp).join(''))?.[1]);
      expect(cap, 'the log has no height cap to check').toBeGreaterThan(0);
      const lines = wrapPixelText(LOG_LINE, scale, panelWidth(vp) - ROW_PAD).length;
      const needed = LOG_ENTRIES * lines * lineHeight(scale) + (LOG_ENTRIES - 1) * LOG_GAP;
      expect(
        needed,
        `three ${lines}-line entries need ${needed}px and the cap is ${cap}px`,
      ).toBeLessThanOrEqual(cap);
    });
  }

  // The HUD floats over the whole window and has to stop where the docked
  // column starts. It was fenced with its own literal, 28px short of the
  // panel, and the DPS readout printed its last column under the border.
  for (const vp of VIEWPORTS.filter(docked)) {
    it(`stops the HUD exactly at the docked panel at ${vp.name}`, () => {
      const fence = declared('.hud', 'right', vp);
      expect(fence, 'the HUD is not fenced off the docked panel').not.toBeNull();
      expect(
        lengthAt(fence!, vp),
        `the HUD reserves ${lengthAt(fence!, vp)}px for a ${lengthAt(declared('.screen', 'width', vp)!, vp)}px panel`,
      ).toBe(lengthAt(declared('.screen', 'width', vp)!, vp));
    });
  }

  it('sizes every rule off the ramp instead of a loose pixel count', () => {
    const loose = [...CSS.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(--ui-') && !v.startsWith('var(--num-'));
    expect(loose).toEqual([]);
  });
});
