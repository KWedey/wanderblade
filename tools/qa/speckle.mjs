#!/usr/bin/env node
// Lone-pixel probe for judged frames.
import { decode } from './png.mjs';

const HELP = `npm run qa:speckle -- <png> [--scale n] [--bands n]

Answers: which colour in this frame is speckling. A judge read our trunks,
mountain and sun corona as "JPEG noise or a broken dither" rather than as
texture, and the marks doing it are single world-pixels with no neighbour.

Read the colour breakdown, not the total. Grass blades and bitmap glyphs are
lone marks too and are meant to be; the total only compares against itself,
frame to frame. A colour that jumps to the top of the list is the culprit.

The scene renders at 1/scale and is upscaled, so one world pixel is a scale x
scale block of one colour. A mark with no neighbour of its own colour on any of
its four sides is lone: at 6x it is a 36px square of a colour nothing beside it
shares, and that is what reads as a dead pixel.

  <png>          path to a PNG, 8-bit, non-interlaced
  --scale <n>    world pixel size in screen pixels (default: inferred)
  --bands <n>    horizontal bands to report separately (default 4)
  --selftest     plant marks with a known answer and exit non-zero if the
                 probe miscounts them
  --right <px>   stop before this x, to leave the docked panel out. Panel type
                 is a bitmap face on its own grid, so counting it here answers
                 a question about the type system, not about the world.

e.g. npm run qa:speckle -- .gauntlet/ours/round33.png --right 1456`;

/**
 * A mark is lone when no orthogonal neighbour shares its colour. Bands are
 * reported separately because the sky and the ground speckle for different
 * reasons and a single number hides which one moved.
 */
function countLone(grid, cols, rows, bands, scale) {
  const lone = new Array(bands).fill(0);
  const total = new Array(bands).fill(0);
  const byColour = new Map();
  const rowOf = new Map();
  let loneAll = 0;
  for (let r = 1; r < rows - 1; r++) {
    const band = Math.min(bands - 1, Math.floor((r / rows) * bands));
    for (let c = 1; c < cols - 1; c++) {
      const v = grid[r * cols + c];
      total[band]++;
      if (
        grid[r * cols + c - 1] !== v &&
        grid[r * cols + c + 1] !== v &&
        grid[(r - 1) * cols + c] !== v &&
        grid[(r + 1) * cols + c] !== v
      ) {
        lone[band]++;
        loneAll++;
        byColour.set(v, (byColour.get(v) ?? 0) + 1);
        const spot = rowOf.get(v) ?? [];
        if (spot.length < 3) spot.push(`${c * scale},${r * scale}`);
        rowOf.set(v, spot);
      }
    }
  }
  return { lone, total, loneAll, byColour, rowOf };
}

/**
 * A check that has only ever passed is indistinguishable from one that cannot
 * fail, so the probe has to be shown counting a known answer before it is
 * trusted on a frame. Plants marks whose count is known by construction.
 */
function selfTest() {
  const cols = 20;
  const rows = 20;
  const grid = new Int32Array(cols * rows).fill(0x101010);
  const set = (c, r, v) => {
    grid[r * cols + c] = v;
  };
  // Three lone marks.
  set(4, 4, 0xff0000);
  set(9, 9, 0x00ff00);
  set(14, 14, 0x0000ff);
  // A horizontal pair and a vertical pair: each mark has a neighbour of its own
  // colour, so neither may be counted. This is the half that catches a probe
  // comparing against the wrong cell.
  set(4, 12, 0xffff00);
  set(5, 12, 0xffff00);
  set(15, 4, 0x00ffff);
  set(15, 5, 0x00ffff);
  const got = countLone(grid, cols, rows, 1, 1).loneAll;
  const want = 3;
  const clean = countLone(new Int32Array(cols * rows).fill(0x101010), cols, rows, 1, 1).loneAll;
  const ok = got === want && clean === 0;
  console.log(`selftest: planted ${want} lone marks and 2 pairs -> counted ${got}` +
    `; flat field -> ${clean}`);
  console.log(ok ? 'PASS' : 'FAIL: the probe is not measuring what it claims');
  return ok;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
if (args.includes('--selftest')) process.exit(selfTest() ? 0 : 1);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const path = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const img = decode(path);
const at = (x, y) => {
  const i = (y * img.w + x) * img.ch;
  return (img.px[i] << 16) | (img.px[i + 1] << 8) | img.px[i + 2];
};

// The client picks its scale off the window width; read it back off the image
// so a probe never has to be told what it is looking at.
function inferScale() {
  const guess = Math.round(img.w / 300);
  return Math.max(2, Math.min(8, guess));
}
const scale = flag('scale', inferScale());
const bands = flag('bands', 4);
const right = Math.min(img.w, flag('right', img.w));
const cols = Math.floor(right / scale);
const rows = Math.floor(img.h / scale);
// One sample per block, from its middle: an upscaled block is one flat colour,
// and sampling a corner would read whatever a HUD edge put on the seam.
const half = Math.floor(scale / 2);
const grid = new Int32Array(cols * rows);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) grid[r * cols + c] = at(c * scale + half, r * scale + half);
}

const { lone, total, loneAll, byColour, rowOf } = countLone(grid, cols, rows, bands, scale);
const sum = total.reduce((a, b) => a + b, 0);
console.log(`${path}  ${right}x${img.h} of ${img.w}x${img.h} at ${scale}x  ${cols}x${rows} world pixels`);
console.log(`  lone marks: ${loneAll}  (${((loneAll / sum) * 100).toFixed(2)}% of the frame)`);
console.log('  the marks themselves:');
for (const [v, n] of [...byColour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  const hexOf = `#${v.toString(16).padStart(6, '0')}`;
  console.log(`    ${hexOf}  ${String(n).padStart(4)}  at ${(rowOf.get(v) ?? []).join('  ')}`);
}
for (let b = 0; b < bands; b++) {
  const y0 = Math.round((b / bands) * img.h);
  const y1 = Math.round(((b + 1) / bands) * img.h);
  console.log(
    `    y ${String(y0).padStart(4)}-${String(y1).padStart(4)}  ` +
      `${String(lone[b]).padStart(5)}  ${((lone[b] / total[b]) * 100).toFixed(2)}%`,
  );
}
