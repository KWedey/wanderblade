#!/usr/bin/env node
// Crop-region colour probe for judged frames.
import { decode } from './png.mjs';

const HELP = `npm run qa:pixels -- <png> <x> <y> <w> <h>

Answers: what colour is that region, in numbers, so a claim about the art can be
settled instead of argued. Reports mean saturation and brightness, the warm and
near-white share, and the eight most common exact colours in the crop.

  <png>             path to a PNG, 8-bit, non-interlaced
  <x> <y> <w> <h>   crop rectangle in image pixels, clamped to the image

e.g. npm run qa:pixels -- .gauntlet/ours/round17.png 1468 0 452 1080`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(args.length === 0 ? 1 : 0);
}
const [path, X, Y, W, H] = args;
if ([X, Y, W, H].some((v) => v === undefined || Number.isNaN(Number(v)))) {
  console.error('need <png> <x> <y> <w> <h>. See --help.');
  process.exit(1);
}
const img = decode(path);
const x0 = +X, y0 = +Y, x1 = Math.min(img.w, +X + +W), y1 = Math.min(img.h, +Y + +H);

const counts = new Map();
let n = 0, sumSat = 0, sumVal = 0, warm = 0, nearWhite = 0;
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = y * img.stride + x * img.ch;
    const r = img.px[i], g = img.px[i + 1], b = img.px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    n++;
    sumSat += sat;
    sumVal += max / 255;
    if (r > g && g >= b && max - min > 40) warm++;
    if (min > 200) nearWhite++;
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`${path}  rect ${x0},${y0} ${x1 - x0}x${y1 - y0}  (${n} px)`);
console.log(`  mean saturation : ${(sumSat / n).toFixed(3)}`);
console.log(`  mean brightness : ${(sumVal / n).toFixed(3)}`);
console.log(`  warm pixels     : ${((warm / n) * 100).toFixed(1)}%`);
console.log(`  near-white      : ${((nearWhite / n) * 100).toFixed(1)}%`);
console.log('  top colours:');
for (const [k, c] of top) console.log(`    rgb(${k})`.padEnd(24) + `${((c / n) * 100).toFixed(1)}%`);
