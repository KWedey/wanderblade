// Panel type as bitmap glyphs: the webfaces measured 50-74% soft pixels at
// every size, against a hard-edged canvas beside them.
//
// The DOM text is kept and only made transparent, never replaced, so the
// accessibility tree is untouched and it still drives layout. The canvas is
// absolutely positioned over it and can never widen its own container, which
// is what stops a long label from clipping at the panel edge.

import { FONT, GLYPH_H, GLYPH_W, textWidth } from './scene/pixels';

/** Marks the in-flow, transparent text that assistive tech still reads. */
const SR_CLASS = 'px-sr';
/** Marks the decorative canvas a sighted player actually sees. */
const CANVAS_CLASS = 'px-ink';
/** Blank rows between wrapped lines, in glyph pixels. */
export const LINE_GAP = 2;

/**
 * Integer scale for a CSS size. The glyph cell is 7px tall, so the scale is
 * how many device pixels one glyph pixel occupies — never fractional, which is
 * the whole point of moving off the webfont.
 */
/**
 * Smallest scale UI type may be drawn at. Stepping to 1 put three glyph sizes
 * inside one gear slot - the "two resolutions" break, in our own panel.
 */
export const MIN_UI_SCALE = 2;

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
 * Joins words the wrap breaks between only as a last resort. `+171M gold` is
 * one reward; splitting it stranded `gold` alone on the next row.
 */
export const NO_BREAK = '\u00a0';

/** The string as glyphs see it — a held joint is drawn as an ordinary space. */
export function plainText(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

function greedyWrap(words: string[], scale: number, maxWidth: number): string[] {
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

/**
 * Wrappable units. A held phrase is one unit while it fits the box alone; past
 * that its joints break, because honouring a bind is worth a stranded word but
 * never the webfont fallback an over-wide line triggers. Broken per phrase, so
 * one name too long for a narrow panel does not unbind the reward beside it.
 */
function units(text: string, scale: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const token of text.split(/[^\S\u00a0]+/)) {
    if (token.length === 0) continue;
    if (textWidth(token, scale) <= maxWidth) out.push(token);
    else out.push(...token.split(NO_BREAK).filter((w) => w.length > 0));
  }
  return out;
}

/**
 * Greedy word wrap. A word too wide to fit alone still gets its own line —
 * `layoutPixelText` is what decides that scale is unusable and steps down.
 */
export function wrapPixelText(text: string, scale: number, maxWidth: number): string[] {
  return greedyWrap(units(text, scale, maxWidth), scale, maxWidth).map(plainText);
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
  minScale = 1,
): PixelLayout | null {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0) return null;
  const floor = Math.max(1, Math.floor(minScale));
  for (let scale = Math.max(floor, Math.floor(preferredScale)); scale >= floor; scale--) {
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
/**
 * The min-height the stylesheet asks for. Cached, because after the first paint
 * the inline value is this module's and the cascade's is no longer readable.
 */
function cascadeMinHeight(el: HTMLElement): number {
  const seen = el.dataset['pxMinH'];
  if (seen !== undefined) return Number(seen);
  const inline = el.style.minHeight;
  el.style.minHeight = '';
  const floor = parseFloat(window.getComputedStyle(el).minHeight) || 0;
  el.style.minHeight = inline;
  el.dataset['pxMinH'] = String(floor);
  return floor;
}

/**
 * Ceiling for a nowrap claim: the widest ancestor up to the nearest positioned
 * one. The immediate parent is usually shrink-wrapped to the webfont's reading
 * of this same text, so capping there caps the bitmap at the width that made it
 * fall back; the positioned ancestor is a fence someone drew on purpose.
 */
/** The text as the browser renders it, so measurement and ink agree. */
function applyCase(text: string, transform: string): string {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return text;
}

function roomFor(el: HTMLElement): number {
  let room = 0;
  for (let node = el.parentElement; node; node = node.parentElement) {
    room = Math.max(room, node.clientWidth);
    if (window.getComputedStyle(node).position !== 'static') break;
  }
  return room > 0 ? room : Infinity;
}

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

  if (!holder) {
    holder = document.createElement('span');
    holder.className = SR_CLASS;
    holder.textContent = trimmed;
    el.textContent = '';
    el.appendChild(holder);
  } else if (holder.textContent !== trimmed) {
    holder.textContent = trimmed;
  }

  const floor = cascadeMinHeight(el);
  const style = window.getComputedStyle(el);
  // The browser measured the box from the transformed text; drawing the raw
  // textContent puts glyphs of a different width in a box sized for others.
  const cased = applyCase(trimmed, style.textTransform);
  if (unsupported(plainText(cased)).length > 0) {
    fallBack(el, holder);
    return false;
  }
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  const outer = outerWidth(el);
  MEASURED_WIDTH.set(el, outer);
  const boxWidth = Math.floor(outer - padLeft - (parseFloat(style.paddingRight) || 0));
  // Honour the author's own white-space: a HUD stat marked nowrap wants the
  // largest type that fits on one line, not the largest that fits at all.
  const nowrap = style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre';
  const preferred = pixelScaleFor(parseFloat(style.fontSize) || GLYPH_H);
  // nowrap is the author saying "this is one token". Its box was sized by the
  // webfont, which is narrower than the bitmap, so claim the room the glyphs
  // need. Only nowrap: claiming for every leaf took the HUD grid's whole track.
  const padX = padLeft + (parseFloat(style.paddingRight) || 0);
  if (nowrap && !remeasured) {
    const want = Math.min(textWidth(cased, preferred) + padX, roomFor(el));
    if (want > outer + 0.5) {
      // An inline box ignores min-width, so the claim silently did nothing and
      // the element fell back anyway. It is a text leaf whose content becomes a
      // canvas, so inline-block costs nothing here.
      if (style.display === 'inline') el.style.display = 'inline-block';
      el.style.minWidth = `${Math.ceil(want)}px`;
      return paintElement(el, dpr, true);
    }
  }
  const layout = layoutPixelText(cased, preferred, boxWidth, nowrap, MIN_UI_SCALE);
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
  const key = `${cased}|${layout.scale}|${layout.lines.length}|${boxWidth}|${align}|${color}|${outline}|${dpr}`;
  if (canvas.dataset['key'] === key) return true;
  canvas.dataset['key'] = key;
  const pad = outline ? layout.scale : 0;
  canvas.style.left = `${padLeft - pad}px`;
  canvas.style.top = `${padTop - pad}px`;
  paintInto(canvas, layout, boxWidth, align, color, outline, dpr);
  // The canvas is out of flow, so the element would otherwise collapse to the
  // transparent text's height and clip a label that wrapped to more lines. Only
  // ever a raise: this used to overwrite the floor outright, and it shrank the
  // Enter the Portal button from a 56px touch target to 23px of glyph.
  const need = layout.height + padTop + (parseFloat(style.paddingBottom) || 0);
  el.style.minHeight = `${Math.max(floor, need)}px`;
  return true;
}

/**
 * True for an element whose whole content is its own text. The two layers this
 * module owns are never leaves themselves: tagging the accessible span would
 * nest a second one inside it, and an inline span measures zero wide, so every
 * label would silently fall back to webfont text.
 */
function isTextLeaf(el: Element): boolean {
  if (el.classList.contains(SR_CLASS) || el.classList.contains(CANVAS_CLASS)) return false;
  for (const child of el.children) {
    if (!child.classList.contains(SR_CLASS) && !child.classList.contains(CANVAS_CLASS)) {
      return false;
    }
  }
  return (el.textContent ?? '').trim().length > 0;
}

/** Tags every text leaf under a root so repaint can find it. */
function mountPixelText(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (isTextLeaf(el)) el.dataset['px'] = '';
  }
}

const DIRTY = 'pxDirty';
/** The box each leaf was last measured in; a leaf whose box moved is repainted. */
const MEASURED_WIDTH = new WeakMap<HTMLElement, number>();

/** clientWidth is 0 for an inline box; its rect is the only honest measure. */
function outerWidth(el: HTMLElement): number {
  return el.clientWidth || el.getBoundingClientRect().width;
}

/**
 * Flags every leaf under `root` for the next changed-only repaint. The view
 * calls it when a class, `hidden` or `disabled` flips, because those move a
 * leaf's colour or width without touching its text.
 */
export function markPixelDirty(root: Element): void {
  if (root instanceof HTMLElement && root.dataset['px'] !== undefined) root.dataset[DIRTY] = '';
  for (const el of root.querySelectorAll<HTMLElement>('[data-px]')) el.dataset[DIRTY] = '';
}

/**
 * A painted leaf keeps its accessible span; assigning textContent removes it.
 * So a leaf still carrying one, unflagged and still in the box it was measured
 * for, has nothing new to draw. A leaf with no span and no text has nothing to
 * draw at all.
 */
function isClean(el: HTMLElement): boolean {
  if (el.dataset[DIRTY] !== undefined) return false;
  if (!el.querySelector(`.${SR_CLASS}`)) return (el.textContent ?? '').trim() === '';
  return MEASURED_WIDTH.get(el) === outerWidth(el);
}

/**
 * Repaints every marked element under a root, tagging any that appeared. With
 * `changedOnly`, a leaf whose text, flags and box are unchanged is skipped
 * before any style is read, and every skip check runs before the first paint so
 * the reads never interleave with the writes.
 */
export function repaintPixelText(root: ParentNode, changedOnly = false): void {
  const dpr = window.devicePixelRatio || 1;
  mountPixelText(root);
  const due: HTMLElement[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-px]')) {
    if (!changedOnly || !isClean(el)) due.push(el);
  }
  for (const el of due) {
    delete el.dataset[DIRTY];
    paintElement(el, dpr);
  }
}
