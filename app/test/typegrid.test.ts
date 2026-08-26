import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

/**
 * Glyph pixels per em, measured off each face by rasterising 'H' at 100px and
 * taking the shortest ink run: Pixelify Sans 10, VT323 8. So one glyph pixel
 * is font-size/10 and font-size/12.5 respectively.
 */
const RAMP: Record<string, number> = {
  '--ui-1': 10,
  '--ui-2': 10,
  '--ui-3': 10,
  '--num-1': 12.5,
  '--num-2': 12.5,
  '--num-3': 12.5,
  '--num-4': 12.5,
};

describe('the panel type grid', () => {
  // A size off its face's grid rasterises a fractional "pixel", and the panel
  // then reads at a finer resolution than the hard-pixel world behind it.
  it('puts every ramp step on a whole glyph pixel', () => {
    for (const [name, perEm] of Object.entries(RAMP)) {
      const match = new RegExp(`${name}:\\s*([\\d.]+)px;`).exec(CSS);
      expect(match, `${name} is not defined`).not.toBeNull();
      const glyph = Number(match![1]) / perEm;
      expect(glyph, `${name} glyph pixel`).toBe(Math.round(glyph));
      expect(glyph, `${name} is sub-pixel`).toBeGreaterThanOrEqual(2);
    }
  });

  it('sizes every rule off the ramp instead of a loose pixel count', () => {
    const loose = [...CSS.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(--ui-') && !v.startsWith('var(--num-'));
    expect(loose).toEqual([]);
  });
});
