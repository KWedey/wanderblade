import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GLYPH_H } from '../src/scene/pixels';
import { pixelScaleFor } from '../src/pixeltext';
import { TARGET_SCENE_WIDTH } from '../src/scene/scene';

const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

const RAMP = ['--ui-1', '--ui-2', '--ui-3', '--num-1', '--num-2', '--num-3', '--num-4'];

/** Panel text renders through the scene's own bitmap face, so a font-size's
 * only job is to pick an integer glyph scale against this. */
const JUDGED_VIEWPORT = 1920;
const WORLD_SCALE = Math.round(JUDGED_VIEWPORT / TARGET_SCENE_WIDTH);

function size(token: string): number {
  const match = new RegExp(`${token}:\\s*([\\d.]+)px;`).exec(CSS);
  expect(match, `${token} is not defined`).not.toBeNull();
  return Number(match![1]);
}

describe('the panel type grid', () => {
  it('is measured against a world scale the scene actually uses', () => {
    expect(WORLD_SCALE).toBe(6);
  });

  // A size that is not an exact multiple of the cell height rounds to a scale,
  // so two different sizes silently collapse onto one and the ramp stops
  // meaning what it says.
  it('sizes every step to a whole number of glyph cells', () => {
    for (const token of RAMP) {
      const px = size(token);
      expect(px % GLYPH_H, `${token} is not a multiple of the ${GLYPH_H}px cell`).toBe(0);
      expect(pixelScaleFor(px) * GLYPH_H, `${token} rounds to a different scale`).toBe(px);
    }
  });

  // The regression this replaces: the ramp before it used scales 2,3,4,7,8 and
  // the one before that mixed all five inside a single panel. 4, 7 and 8 do not
  // divide 6, so panel type sat on a lattice the world does not share.
  it('puts every step on a whole sub-lattice of the world grid', () => {
    for (const token of RAMP) {
      const scale = pixelScaleFor(size(token));
      expect(scale, `${token} is sub-pixel`).toBeGreaterThanOrEqual(2);
      expect(WORLD_SCALE % scale, `${token} runs at ${scale}, which does not divide ${WORLD_SCALE}`).toBe(0);
    }
  });

  it('sizes every rule off the ramp instead of a loose pixel count', () => {
    const loose = [...CSS.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(--ui-') && !v.startsWith('var(--num-'));
    expect(loose).toEqual([]);
  });
});
