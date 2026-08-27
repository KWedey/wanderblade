// Bakes the character grids in pixels.ts into offscreen canvases at 1 canvas
// pixel per scene unit, then draws them. Baking once at startup means the hot
// loop is drawImage calls, not thousands of per-pixel fillRects.
//
// Every sprite also gets a white silhouette ("flash") used for hit frames, so a
// struck monster reads instantly without a tint pass per frame.

import type { InkSet } from './palette';
import {
  BODY_FONT,
  massProfile,
  textWidth,
  type BitmapFont,
  type MassProfile,
  type SpriteMap,
} from './pixels';

export interface BakedSprite {
  image: HTMLCanvasElement;
  /** White fill with the outline intact, for hit flashes. */
  flash: HTMLCanvasElement;
  width: number;
  height: number;
  /** Where the creature actually is, as opposed to where its box is. */
  mass: MassProfile;
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

  for (let y = 0; y < height; y++) {
    const row = map.rows[y]!;
    for (let x = 0; x < width; x++) {
      const glyph = row[x]!;
      if (glyph === '.') continue;
      const inkName = map.legend[glyph] ?? '';
      const color = ink[inkName];
      if (!color) continue;
      ictx.fillStyle = color;
      ictx.fillRect(x, y, 1, 1);
      // The flash keeps its outline. A fully-white silhouette loses the shape
      // that identifies the creature and reads as a missing sprite.
      fctx.fillStyle = inkName === 'outline' ? color : '#ffffff';
      fctx.fillRect(x, y, 1, 1);
    }
  }
  return { image, flash, width, height, mass: massProfile(map) };
}

/**
 * Draw a baked sprite with its *feet* at (x, y) and optional horizontal flip.
 * Positions are floored so sprites always land on the scene's pixel grid — a
 * half-pixel offset is what makes procedural pixel art look mushy. `scale`
 * grows the sprite from that same feet anchor (a dungeon guardian filling the
 * room, DECISIONS.md #58) without moving any combat position derived from it.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: BakedSprite,
  x: number,
  y: number,
  flip = false,
  useFlash = false,
  scale = 1,
): void {
  const img = useFlash ? sprite.flash : sprite.image;
  const w = sprite.width * scale;
  const h = sprite.height * scale;
  const px = Math.floor(x - w / 2);
  const py = Math.floor(y - h);
  if (!flip) {
    ctx.drawImage(img, px, py, w, h);
    return;
  }
  ctx.save();
  ctx.translate(px + w, py);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
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
  font: BitmapFont,
): void {
  for (let gy = 0; gy < font.h; gy++) {
    const row = rows[gy];
    if (!row) continue;
    // Coalesce each horizontal run into one fillRect: a payout in a hot combo
    // is redrawn nine times over for its outline, once per frame.
    let runStart = -1;
    for (let gx = 0; gx <= font.w; gx++) {
      if (gx < font.w && row[gx] === '#') {
        if (runStart < 0) runStart = gx;
        continue;
      }
      if (runStart < 0) continue;
      ctx.fillRect(x + runStart * scale, y + gy * scale, (gx - runStart) * scale, scale);
      runStart = -1;
    }
  }
}

export interface TextStyle {
  scale: number;
  fill: string;
  /** 1px ring drawn as eight offset copies. Null on an opaque plate. */
  outline?: string | null;
  align?: TextAlign;
  font?: BitmapFont;
}

/**
 * Chunky outlined bitmap text \u2014 the outline is a real 1px ring drawn as eight
 * offset copies, which is how the reference art keeps numbers legible against
 * both a bright sky and dark soil.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  const { scale, fill } = style;
  const font = style.font ?? BODY_FONT;
  const outline = style.outline === undefined ? '#1a1c2c' : style.outline;
  const align = style.align ?? 'center';
  const startX = Math.floor(align === 'center' ? x - textWidth(text, scale, font) / 2 : x);
  const startY = Math.floor(y);
  const advance = (font.w + 1) * scale;

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
    for (let i = 0; i < text.length; i++) {
      const rows = font.glyphs[text[i]!];
      if (!rows) continue;
      blitGlyph(ctx, rows, startX + i * advance + ox, startY + oy, scale, font);
    }
  }
}
