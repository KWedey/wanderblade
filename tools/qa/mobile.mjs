#!/usr/bin/env node
// Phone-viewport capture and layout probe.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from './playwright.mjs';
import { DEFAULT_PORT, requireServer, resolvePort } from './port.mjs';

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Insets are the hardware, not the emulator: Chromium reports every
// env(safe-area-inset-*) as 0 until Emulation.setSafeAreaInsetsOverride says
// otherwise, which is why a notch bug survived eleven rounds of desktop capture.
const DEVICES = [
  { id: 'iphone-390x844-dpr3', w: 390, h: 844, dpr: 3, ua: IOS, insets: { top: 59, bottom: 34, left: 0, right: 0 } },
  { id: 'iphone-390x844-dpr2', w: 390, h: 844, dpr: 2, ua: IOS, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { id: 'android-360x800-dpr3', w: 360, h: 800, dpr: 3, ua: ANDROID, insets: { top: 24, bottom: 0, left: 0, right: 0 } },
  { id: 'android-360x800-dpr2', w: 360, h: 800, dpr: 2, ua: ANDROID, insets: { top: 24, bottom: 0, left: 0, right: 0 } },
  { id: 'iphone-844x390-landscape', w: 844, h: 390, dpr: 3, ua: IOS, insets: { top: 0, bottom: 21, left: 59, right: 59 } },
  { id: 'desktop-1920x1080-dpr1', w: 1920, h: 1080, dpr: 1, ua: null, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
];

const HELP = `npm run qa:mobile -- [options]

Answers: does the layout hold on a phone, is the type on the world's pixel grid,
and does anything load-bearing sit under the notch or the home indicator?

  --only <id>       one device instead of all ${DEVICES.length}
  --stage <id>      staging preset: fresh | mid | late   (default mid)
  --seed <n>        run seed                             (default 7)
  --no-insets       leave safe-area insets at 0, as a bare browser reports them
  --bands           draw the inset bands onto the screenshots
  --port <n>        dev server port          (default ${DEFAULT_PORT}, or $WB_QA_PORT)

Devices: ${DEVICES.map((d) => d.id).join(', ')}

Writes <repo>/.gauntlet/mobile/<id>.png per device and one JSON probe to stdout.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const stage = flag('stage', 'mid');
const seed = flag('seed', '7');
const only = flag('only', null);
const withInsets = !argv.includes('--no-insets');
const drawBands = argv.includes('--bands');
const port = resolvePort(argv);

const repo = fileURLToPath(new URL('../..', import.meta.url));
const outDir = join(repo, '.gauntlet', 'mobile');
mkdirSync(outDir, { recursive: true });

await requireServer(port);
const chosen = only ? DEVICES.filter((d) => d.id === only) : DEVICES;
if (chosen.length === 0) {
  console.error(`unknown device '${only}'. See --help.`);
  process.exit(1);
}
console.error(
  `probing :${port} stage=${stage} seed=${seed}, insets ${withInsets ? 'emulated' : 'off'}, ${chosen.length} device(s)`,
);

function probe(page, dev) {
  return page.evaluate(({ dpr, insets }) => {
    const px = (v) => Math.round(v * 100) / 100;
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height),
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
      };
    };
    const typeOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const f = parseFloat(getComputedStyle(el).fontSize);
      return { sel, cssPx: px(f), devicePx: px(f * dpr), gridAligned: Number.isInteger(px(f * dpr)) };
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const canvas = document.querySelector('canvas.scene');
    const doc = document.documentElement;
    const screen = document.querySelector('.screen');
    const stacked = screen ? getComputedStyle(screen).position === 'static' : false;
    const chrome = document.querySelector('.chrome') ?? screen;
    const chromeRect = chrome ? chrome.getBoundingClientRect() : null;
    const targets = [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { label: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28), w: px(r.width), h: px(r.height), y: px(r.y) };
      });
    return {
      viewport: { vw, vh, dpr },
      pageScrolls: { x: doc.scrollWidth > vw, y: doc.scrollHeight > vh },
      // Pixel art upscaled by a fraction shimmers; this is the number that says so.
      canvas: canvas
        ? (() => {
            const pixelScale = Math.max(2, Math.min(8, Math.round(canvas.clientWidth / 300) || 2));
            const units = Math.ceil(canvas.clientWidth / pixelScale);
            const blit = canvas.width / units;
            return { cssW: canvas.clientWidth, backingW: canvas.width, pixelScale, sceneUnitsWide: units, blitScale: px(blit), blitInteger: Number.isInteger(blit) };
          })()
        : null,
      chrome: chromeRect ? { h: px(chromeRect.height), w: px(chromeRect.width) } : null,
      worldFraction: chromeRect ? px(stacked ? 1 - chromeRect.height / vh : 1 - chromeRect.width / vw) : 1,
      panelScroll: screen ? { scrollH: screen.scrollHeight, clientH: screen.clientHeight } : null,
      type: ['.gold', '.dps', '.region', '.header-sub', '.upgrade-name', '.upgrade-cost', '.log-line'].map(typeOf).filter(Boolean),
      // The iOS floor is 44pt square; anything under it is a mis-tap waiting.
      smallTargets: targets.filter((t) => t.h < 44 || t.w < 44),
      underTop: targets.filter((t) => t.y < insets.top).map((t) => t.label),
      underBottom: targets.filter((t) => t.y + t.h > vh - insets.bottom).map((t) => t.label),
      overflowingX: [...document.querySelectorAll('.screen *, .hud *')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
        .slice(0, 8)
        .map((el) => String(el.className || el.tagName).slice(0, 40)),
      strikeHint: rect('.strike-hint'),
    };
  }, { dpr: dev.dpr, insets: dev.insets });
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const dev of chosen) {
  const ctx = await browser.newContext({
    viewport: { width: dev.w, height: dev.h },
    deviceScaleFactor: dev.dpr,
    isMobile: dev.dpr > 1,
    hasTouch: dev.dpr > 1,
    ...(dev.ua ? { userAgent: dev.ua } : {}),
  });
  const page = await ctx.newPage();
  if (withInsets) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: dev.insets });
  }
  await page.goto(`http://localhost:${port}/?stage=${stage}&seed=${seed}`, { waitUntil: 'networkidle' });
  if (stage !== 'fresh') {
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return !/Zone 1\/\d/.test(t) && /DPS/.test(t);
    }, { timeout: 60000 });
  }
  await page.waitForTimeout(600);
  const result = { id: dev.id, ...(await probe(page, dev)) };
  if (drawBands) {
    await page.evaluate((insets) => {
      const band = (pos, h, label) => {
        if (!h) return;
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:0;right:0;${pos};height:${h}px;z-index:9999;background:rgba(255,0,0,.42);border-bottom:2px solid red;pointer-events:none;font:12px monospace;color:#fff;padding:2px 6px;box-sizing:border-box`;
        d.textContent = label;
        document.body.appendChild(d);
      };
      band('top:0', insets.top, `safe-area-inset-top ${insets.top}px`);
      band('bottom:0', insets.bottom, `safe-area-inset-bottom ${insets.bottom}px`);
    }, dev.insets);
  }
  result.shot = join(outDir, `${dev.id}.png`);
  writeFileSync(result.shot, await page.screenshot());
  results.push(result);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
