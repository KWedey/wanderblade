// Does a tap that hits nothing say so, and can a tap on the road still catch?
// The unit tests pin the rule in world.ts; only a browser proves the page routes
// a pointer tap through it. The canvas counts misses and catches in data
// attributes and publishes where coins land; this taps sky, then the landing span.

import { ProbeFailure, withBrowser } from './playwright.mjs';
import { DEFAULT_PORT, requireServer, resolvePort } from './port.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Wanderblade miss probe — a tap on empty sky whiffs, a tap on the landing span still catches

  npm run qa:miss -- [--port <n>] [--stage <name>] [--seed <n>] [--taps <n>]

Exits non-zero if a sky tap is not counted as a miss, or if ${'--taps'} taps
along the coin landing span catch nothing.

  --stage <id>   staging preset: fresh | mid | late   (default mid)
  --seed <n>     run seed                             (default 7)
  --taps <n>     taps along the landing span          (default 40)
  --port <n>     dev server port                      (default ${DEFAULT_PORT}, or $WB_QA_PORT)`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const port = resolvePort(argv);
const stage = flag('stage', 'mid');
const seed = flag('seed', '7');
const taps = Number(flag('taps', '40'));
if (!Number.isInteger(taps) || taps < 1) {
  console.error(`--taps must be a whole number of at least 1, got ${flag('taps', '40')}`);
  process.exit(2);
}
await requireServer(port);

let report;
try {
  report = await withBrowser(async (browser) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`http://localhost:${port}/?stage=${stage}&seed=${seed}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /DPS/.test(document.body.innerText || ''), { timeout: 60000 });
    await page.waitForTimeout(300);

    const canvas = page.locator('[data-role="scene"]');
    const counters = async () => {
      const [misses, catches] = await Promise.all([canvas.getAttribute('data-misses'), canvas.getAttribute('data-catches')]);
      return { misses: Number(misses), catches: Number(catches) };
    };
    const box = await canvas.boundingBox();
    if (!box) throw new ProbeFailure('the scene canvas has no box');
    const landing = (await canvas.getAttribute('data-landing') ?? '').split(',').map(Number);
    if (landing.length !== 3 || landing.some((n) => !Number.isFinite(n))) {
      throw new ProbeFailure('the scene canvas does not publish data-landing');
    }
    const [x0, x1, landY] = landing;

    // Empty sky: the top-left corner of the world band, well left of the hero and
    // far above any coin's apex. Nothing is there to hit, so it has to whiff.
    const sky = { x: box.x + 40, y: box.y + 30 };
    const before = await counters();
    await page.mouse.click(sky.x, sky.y);
    await page.waitForTimeout(150);
    const afterSky = await counters();
    if (afterSky.misses !== before.misses + 1) {
      throw new ProbeFailure(`a tap on empty sky was not counted as a miss (${before.misses} -> ${afterSky.misses})`, {
        sky,
      });
    }

    // The landing span: coins from every kill come down across it a few times a
    // second, so a walk of taps along it has to catch at least one.
    for (let i = 0; i < taps; i++) {
      const x = x0 + ((x1 - x0) * (i % 8)) / 7;
      await page.mouse.click(x, landY - 6);
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(250);
    const afterRoad = await counters();
    if (afterRoad.catches <= afterSky.catches) {
      throw new ProbeFailure(`${taps} taps along the landing span caught nothing`, { landing: { x0, x1, y: landY } });
    }
    return { sky, landing: { x0, x1, y: landY }, before, afterSky, afterRoad };
  });
} catch (e) {
  if (!(e instanceof ProbeFailure)) throw e;
  console.error(`FAIL: ${e.message}`, e.extra ? JSON.stringify(e.extra) : '');
  process.exit(1);
}
console.log(JSON.stringify({ port, stage, seed, ...report }, null, 2));
console.log('pass: a sky tap whiffs and a landing-span tap catches');
