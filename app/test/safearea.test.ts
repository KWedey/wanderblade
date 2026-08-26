import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

/** One rule body, by selector, with comments stripped. */
function rule(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `${selector} has no rule`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Split on whitespace at paren depth zero, so a calc() stays one value. */
function values(shorthand: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of shorthand.trim()) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** `padding: a b c` is top / sides / bottom; one or two values share an axis. */
function padding(body: string): { top: string; bottom: string } {
  const short = /(?:^|\s)padding:\s*([^;]+);/.exec(body);
  if (!short) return { top: '', bottom: '' };
  const parts = values(short[1]!);
  return { top: parts[0] ?? '', bottom: parts.length >= 3 ? parts[2]! : (parts[0] ?? '') };
}

// The whole page runs under viewport-fit=cover, so anything pinned to a screen
// edge renders beneath the notch or the home indicator unless it says otherwise.
// The regression this replaces: .hud spent the top inset on its bottom padding,
// which left the gold total - the game's headline number - under the notch on
// every iPhone, and pushed the panel down by the height of the island.
describe('elements pinned to a screen edge clear the phone hardware', () => {
  const TOP = 'env(safe-area-inset-top';
  const BOTTOM = 'env(safe-area-inset-bottom';

  it('pays the top inset at the top of the HUD, not the bottom', () => {
    const pad = padding(rule('.hud'));
    expect(pad.top, '.hud top padding ignores the notch').toContain(TOP);
    expect(pad.bottom, '.hud spends the top inset on its bottom edge').not.toContain(TOP);
  });

  it.each([
    ['.toast', 'top', TOP],
    ['.strike-hint', 'bottom', BOTTOM],
    ['.debug-toggle', 'bottom', BOTTOM],
    ['.debug-drawer', 'bottom', BOTTOM],
  ])('offsets %s from its %s edge by the inset', (selector, edge, token) => {
    const offset = new RegExp(`(?:^|\\s)${edge}:\\s*([^;]+);`).exec(rule(selector));
    expect(offset, `${selector} sets no ${edge}`).not.toBeNull();
    expect(offset![1], `${selector} sits under the phone hardware`).toContain(token);
  });

  // An inset only earns its space on the edge the element actually touches.
  it('drops the bottom inset from the panel once portrait stacks it on top', () => {
    const portrait = /@media \(max-aspect-ratio: 1\/1\)/.exec(CSS);
    expect(portrait).not.toBeNull();
    const block = CSS.slice(portrait!.index);
    const bodies = [...block.matchAll(/\.screen \{([\s\S]*?)\}/g)].map((m) => m[1]!);
    const stacked = bodies.find((b) => b.includes('flex: 1 1 auto'));
    expect(stacked, 'portrait has no stacked .screen rule').toBeDefined();
    expect(stacked!, 'portrait panel keeps a home-indicator inset it never touches').toContain(
      'padding-bottom: 14px',
    );
  });
});
