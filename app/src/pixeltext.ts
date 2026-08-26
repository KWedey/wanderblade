// Panel type as bitmap glyphs: the webfaces measured 50-74% soft pixels at
// every size, against a hard-edged canvas beside them.
//
// The DOM text is kept and only made transparent, never replaced, so the
// accessibility tree is untouched and it still drives layout. The canvas is
// absolutely positioned over it and can never widen its own container, which
// is what stops a long label from clipping at the panel edge.

import { FONT, GLYPH_H, GLYPH_W, textWidth } from './scene/pixels';

/** Marks the in-flow, transparent text that assistive tech still reads. */
export const SR_CLASS = 'px-sr';
/** Marks the decorative canvas a sighted player actually sees. */
export const CANVAS_CLASS = 'px-ink';
/** Blank rows between wrapped lines, in glyph pixels. */
export const LINE_GAP = 2;

/**
 * Integer scale for a CSS size. The glyph cell is 7px tall, so the scale is
 * how many device pixels one glyph pixel occupies — never fractional, which is
 * the whole point of moving off the webfont.
 */
export function pixelScaleFor(fontSizePx: number): number {
  return Math.max(1, Math.round(fontSizePx / GLYPH_H));
}

/** Characters with no glyph. Callers render the DOM text instead of a hole. */
export function unsupported(text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (!FONT[ch]) missing.add(ch);
  }
  return [...missing];
}

export interface PixelTextMetrics {
  width: number;
  height: number;
}

export function measurePixelText(text: string, scale: number): PixelTextMetrics {
  return { width: textWidth(text, scale), height: GLYPH_H * scale };
}

/**
 * Greedy word wrap. A word too wide to fit alone still gets its own line —
 * `layoutPixelText` is what decides that scale is unusable and steps down.
 */
export function wrapPixelText(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${line} ${word}`;
    if (textWidth(candidate, scale) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

export interface PixelLayout {
  scale: number;
  lines: string[];
  /** Width of the widest line. Never exceeds the `maxWidth` asked for. */
  width: number;
  height: number;
}

export function lineHeight(scale: number): number {
  return (GLYPH_H + LINE_GAP) * scale;
}

/**
 * Largest scale at or below `preferred` whose every line fits `maxWidth`.
 * Null when even 1× cannot fit, which is the caller's cue to leave the element
 * as plain DOM text rather than ship a clipped word.
 */
export function layoutPixelText(
  text: string,
  preferredScale: number,
  maxWidth: number,
  singleLine = false,
): PixelLayout | null {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0) return null;
  for (let scale = Math.max(1, Math.floor(preferredScale)); scale >= 1; scale--) {
    const lines = singleLine
      ? [trimmed.replace(/\s+/g, ' ')]
      : wrapPixelText(trimmed, scale, maxWidth);
    const width = lines.reduce((w, l) => Math.max(w, textWidth(l, scale)), 0);
    if (width <= maxWidth) {
      const height = lines.length * lineHeight(scale) - LINE_GAP * scale;
      return { scale, lines, width, height };
    }
  }
  return null;
}

export type PixelAlign = 'left' | 'center' | 'right';

/** Left edge of one line inside a box of `boxWidth`. */
export function alignOffset(lineWidth: number, boxWidth: number, align: PixelAlign): number {
  if (align === 'center') return Math.floor((boxWidth - lineWidth) / 2);
  if (align === 'right') return boxWidth - lineWidth;
  return 0;
}

/** Horizontal runs, so a glyph costs a handful of fills rather than 35. */
function blit(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  scale: number,
): void {
  let penX = x;
  for (const ch of line) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = glyph[row] ?? '';
        let run = 0;
        for (let col = 0; col <= GLYPH_W; col++) {
          if (col < GLYPH_W && bits[col] === '#') {
            run++;
            continue;
          }
          if (run > 0) {
            ctx.fillRect(penX + (col - run) * scale, y + row * scale, run * scale, scale);
            run = 0;
          }
        }
      }
    }
    penX += (GLYPH_W + 1) * scale;
  }
}

/** Ring offsets for the outline pass, in glyph pixels. */
const RING: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function paintInto(
  canvas: HTMLCanvasElement,
  layout: PixelLayout,
  boxWidth: number,
  align: PixelAlign,
  color: string,
  outline: string | null,
  dpr: number,
): void {
  const { scale, lines, height } = layout;
  // The ring needs a pixel of room outside the text box on every side.
  const pad = outline ? scale : 0;
  const cw = boxWidth + pad * 2;
  const ch = height + pad * 2;
  canvas.width = Math.max(1, Math.round(cw * dpr));
  canvas.height = Math.max(1, Math.round(ch * dpr));
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  lines.forEach((line, index) => {
    const originX = pad + alignOffset(textWidth(line, scale), boxWidth, align);
    const originY = pad + index * lineHeight(scale);
    if (outline) {
      ctx.fillStyle = outline;
      for (const [ox, oy] of RING) blit(ctx, line, originX + ox * scale, originY + oy * scale, scale);
    }
    ctx.fillStyle = color;
    blit(ctx, line, originX, originY, scale);
  });
}

const ALIGNMENTS: Record<string, PixelAlign> = {
  center: 'center',
  right: 'right',
  end: 'right',
};

/** Strips the bitmap layer, restoring the element to ordinary DOM text. */
function fallBack(el: HTMLElement, holder: HTMLElement | null): void {
  el.querySelector(`.${CANVAS_CLASS}`)?.remove();
  if (holder) holder.classList.remove('px-hidden');
}

/**
 * False when the element cannot take bitmap type — an unsupported character,
 * a container too narrow for even 1× glyphs, or a box with no measurable
 * width. A legible webfont beats a hole or a clipped word.
 */
export function paintElement(
  el: HTMLElement,
  dpr = window.devicePixelRatio || 1,
  remeasured = false,
): boolean {
  let holder = el.querySelector<HTMLElement>(`.${SR_CLASS}`);
  const text = (holder ? holder.textContent : el.textContent) ?? '';
  const trimmed = text.trim();
  if (!trimmed) {
    fallBack(el, holder);
    return false;
  }
  if (unsupported(trimmed).length > 0) {
    fallBack(el, holder);
    return false;
  }

  if (!holder) {
    holder = document.createElement('span');
    holder.className = SR_CLASS;
    holder.textContent = trimmed;
    el.textContent = '';
    el.appendChild(holder);
  } else if (holder.textContent !== trimmed) {
    holder.textContent = trimmed;
  }

  const style = window.getComputedStyle(el);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  // clientWidth is 0 for an inline box; its rect is the only honest measure.
  const outer = el.clientWidth || el.getBoundingClientRect().width;
  const boxWidth = Math.floor(outer - padLeft - (parseFloat(style.paddingRight) || 0));
  // Honour the author's own white-space: a HUD stat marked nowrap wants the
  // largest type that fits on one line, not the largest that fits at all.
  const nowrap = style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre';
  const preferred = pixelScaleFor(parseFloat(style.fontSize) || GLYPH_H);
  // nowrap is the author saying "this is one token". A content-sized flex or
  // grid item is only as wide as the webfont needed, which would silently drop
  // the bitmap a scale step or two; claim the room instead, bounded by the
  // parent so a phone column cannot overflow.
  if (nowrap) {
    const natural = textWidth(trimmed, preferred) + padLeft + (parseFloat(style.paddingRight) || 0);
    const parentWidth = el.parentElement?.clientWidth ?? natural;
    const want = Math.min(natural, parentWidth);
    if (!remeasured && want > outer + 0.5) {
      el.style.minWidth = `${Math.ceil(want)}px`;
      return paintElement(el, dpr, true);
    }
  }
  const layout = layoutPixelText(trimmed, preferred, boxWidth, nowrap);
  if (!layout) {
    fallBack(el, holder);
    return false;
  }

  const align = ALIGNMENTS[style.textAlign] ?? 'left';
  const color = style.color;
  // Opt-in per subtree. HUD type floats over open sky and needs the ring the
  // world's own numbers wear; panel type sits on a dark plate and does not.
  const ring = style.getPropertyValue('--px-outline').trim();
  const outline = ring.length > 0 ? ring : null;
  holder.classList.add('px-hidden');

  let canvas = el.querySelector<HTMLCanvasElement>(`.${CANVAS_CLASS}`);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
  }
  const key = `${trimmed}|${layout.scale}|${layout.lines.length}|${boxWidth}|${align}|${color}|${outline}|${dpr}`;
  if (canvas.dataset['key'] === key) return true;
  canvas.dataset['key'] = key;
  const pad = outline ? layout.scale : 0;
  canvas.style.left = `${padLeft - pad}px`;
  canvas.style.top = `${padTop - pad}px`;
  paintInto(canvas, layout, boxWidth, align, color, outline, dpr);
  // The canvas is out of flow, so the element would otherwise collapse to the
  // transparent text's height and clip a label that wrapped to more lines.
  el.style.minHeight = `${layout.height + padTop + (parseFloat(style.paddingBottom) || 0)}px`;
  return true;
}

/**
 * True for an element whose whole content is its own text. The two layers this
 * module owns are never leaves themselves: tagging the accessible span would
 * nest a second one inside it, and an inline span measures zero wide, so every
 * label would silently fall back to webfont text.
 */
export function isTextLeaf(el: Element): boolean {
  if (el.classList.contains(SR_CLASS) || el.classList.contains(CANVAS_CLASS)) return false;
  for (const child of el.children) {
    if (!child.classList.contains(SR_CLASS) && !child.classList.contains(CANVAS_CLASS)) {
      return false;
    }
  }
  return (el.textContent ?? '').trim().length > 0;
}

/** Tags every text leaf under a root so repaint can find it. */
export function mountPixelText(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (isTextLeaf(el)) el.dataset['px'] = '';
  }
}

/** Repaints every marked element under a root, tagging any that appeared. */
export function repaintPixelText(root: ParentNode): void {
  const dpr = window.devicePixelRatio || 1;
  mountPixelText(root);
  for (const el of root.querySelectorAll<HTMLElement>('[data-px]')) {
    paintElement(el, dpr);
  }
}
