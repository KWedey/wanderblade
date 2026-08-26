// Panel type as bitmap glyphs: the webfaces measured 50-74% soft pixels at
// every size, against a hard-edged canvas beside them.
//
// The DOM text is kept and only made visually silent, never replaced, so the
// accessibility tree is untouched and the canvas stays decorative.

import { FONT, GLYPH_H, GLYPH_W, textWidth } from './scene/pixels';

/** Marks the visually-silent span that assistive tech still reads. */
export const SR_CLASS = 'px-sr';
/** Marks the decorative canvas a sighted player actually sees. */
export const CANVAS_CLASS = 'px-ink';

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

function paintInto(
  canvas: HTMLCanvasElement,
  text: string,
  scale: number,
  color: string,
  dpr: number,
): void {
  const { width, height } = measurePixelText(text, scale);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  let penX = 0;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < GLYPH_H; row++) {
        const line = glyph[row] ?? '';
        for (let col = 0; col < GLYPH_W; col++) {
          if (line[col] !== '#') continue;
          ctx.fillRect(penX + col * scale, row * scale, scale, scale);
        }
      }
    }
    penX += (GLYPH_W + 1) * scale;
  }
}

/**
 * False when the font lacks a character: a legible webfont beats a hole where
 * a glyph should be, so the element is left as plain DOM text.
 */
export function paintElement(el: HTMLElement, dpr = window.devicePixelRatio || 1): boolean {
  const src = el.querySelector<HTMLElement>(`.${SR_CLASS}`);
  const text = (src ? src.textContent : el.textContent) ?? '';
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (unsupported(trimmed).length > 0) {
    if (src) {
      el.textContent = trimmed;
    }
    return false;
  }

  const style = window.getComputedStyle(el);
  const scale = pixelScaleFor(parseFloat(style.fontSize) || GLYPH_H);
  const color = style.color;

  let holder = src;
  if (!holder) {
    holder = document.createElement('span');
    holder.className = SR_CLASS;
    holder.textContent = trimmed;
    el.textContent = '';
    el.appendChild(holder);
  } else if (holder.textContent !== trimmed) {
    holder.textContent = trimmed;
  }

  let canvas = el.querySelector<HTMLCanvasElement>(`.${CANVAS_CLASS}`);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = CANVAS_CLASS;
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
  }
  const key = `${trimmed}|${scale}|${color}|${dpr}`;
  if (canvas.dataset['key'] === key) return true;
  canvas.dataset['key'] = key;
  paintInto(canvas, trimmed, scale, color, dpr);
  return true;
}

/** True for an element whose whole content is its own text. */
export function isTextLeaf(el: Element): boolean {
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
