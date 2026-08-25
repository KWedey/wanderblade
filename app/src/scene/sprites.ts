// Bakes the character grids in pixels.ts into offscreen canvases at 1 canvas
// pixel per scene unit, then draws them. Baking once at startup means the hot
// loop is drawImage calls, not thousands of per-pixel fillRects.
//
// Every sprite also gets a white silhouette ("flash") used for hit frames, so a
// struck monster reads instantly without a tint pass per frame.

import type { InkSet } from './palette';
import { FONT, GLYPH_H, GLYPH_W, textWidth, type SpriteMap } from './pixels';

export interface BakedSprite {
  image: HTMLCanvasElement;
  /** Solid-white silhouette of the same grid, for hit flashes. */
  flash: HTMLCanvasElement;
  width: number;
  height: number;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}

/** 2d context or bust — returns a non-nullable handle so callers can narrow once. */
export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sprites: 2d context unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Rasterize one grid against `ink`. Glyphs with no ink entry are skipped. */
export function bakeSprite(map: SpriteMap, ink: InkSet): BakedSprite {
  const height = map.rows.length;
  const width = map.rows[0]?.length ?? 0;
  const image = makeCanvas(width, height);
  const flash = makeCanvas(width, height);
  const ictx = context(image);
  const fctx = context(flash);
  fctx.fillStyle = '#ffffff';

  for (let y = 0; y < height; y++) {
    const row = map.rows[y]!;
    for (let x = 0; x < width; x++) {
      const glyph = row[x]!;
      if (glyph === '.') continue;
      const color = ink[map.legend[glyph] ?? ''];
      if (!color) continue;
      ictx.fillStyle = color;
      ictx.fillRect(x, y, 1, 1);
      fctx.fillRect(x, y, 1, 1);
    }
  }
  return { image, flash, width, height };
}

/**
 * Draw a baked sprite with its *feet* at (x, y) and optional horizontal flip.
 * Positions are floored so sprites always land on the scene's pixel grid — a
 * half-pixel offset is what makes procedural pixel art look mushy.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: BakedSprite,
  x: number,
  y: number,
  flip = false,
  useFlash = false,
): void {
  const img = useFlash ? sprite.flash : sprite.image;
  const px = Math.floor(x - sprite.width / 2);
  const py = Math.floor(y - sprite.height);
  if (!flip) {
    ctx.drawImage(img, px, py);
    return;
  }
  ctx.save();
  ctx.translate(px + sprite.width, py);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Draw a sprite rotated about a pivot given in sprite-local pixels. Smoothing
 * stays off, so the rotation resamples nearest-neighbour and the blade keeps
 * hard pixel edges instead of feathering.
 */
export function drawSpriteRotated(
  ctx: CanvasRenderingContext2D,
  sprite: BakedSprite,
  x: number,
  y: number,
  radians: number,
  pivotX: number,
  pivotY: number,
  flip = false,
): void {
  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));
  ctx.scale(flip ? -1 : 1, 1);
  ctx.rotate(radians);
  ctx.drawImage(sprite.image, -pivotX, -pivotY);
  ctx.restore();
}

// --- In-world text -------------------------------------------------------

export type TextAlign = 'left' | 'center';

function blitGlyph(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  scale: number,
): void {
  for (let gy = 0; gy < GLYPH_H; gy++) {
    const row = rows[gy]!;
    let run = 0;
    // Coalesce horizontal runs so a glyph costs a handful of fills, not 35.
    for (let gx = 0; gx <= GLYPH_W; gx++) {
      if (gx < GLYPH_W && row[gx] === '#') {
        run++;
        continue;
      }
      if (run > 0) {
        ctx.fillRect(x + (gx - run) * scale, y + gy * scale, run * scale, scale);
        run = 0;
      }
    }
  }
}

/**
 * Chunky outlined bitmap text — the outline is a real 1px ring drawn as eight
 * offset copies, which is how the reference art keeps numbers legible against
 * both a bright sky and dark soil.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: string,
  outline: string | null = '#1a1c2c',
  align: TextAlign = 'center',
): void {
  const upper = text.toUpperCase();
  const startX = Math.floor(align === 'center' ? x - textWidth(upper, scale) / 2 : x);
  const startY = Math.floor(y);
  const advance = (GLYPH_W + 1) * scale;

  const passes: Array<[number, number, string]> = [];
  if (outline) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox !== 0 || oy !== 0) passes.push([ox * scale, oy * scale, outline]);
      }
    }
  }
  passes.push([0, 0, fill]);

  for (const [ox, oy, color] of passes) {
    ctx.fillStyle = color;
    for (let i = 0; i < upper.length; i++) {
      const rows = FONT[upper[i]!] ?? FONT[text[i]!];
      if (!rows) continue;
      blitGlyph(ctx, rows, startX + i * advance + ox, startY + oy, scale);
    }
  }
}
