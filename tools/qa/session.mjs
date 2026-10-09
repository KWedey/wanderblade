// Does a first session reach ascension?
//
// ADR #63's exit: a first-time player taps at a human rate, buys what turns
// green, and ascends inside one sitting. The sim proves it for a bot against
// the engine; this proves it for a thumb against the DOM.

import { ProbeFailure, withBrowser } from './playwright.mjs';
import { requireServer, resolvePort } from './port.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Wanderblade session probe — a fresh run, tapped at a thumb's pace, until ascension

  npm run qa:session -- [--port <n>] [--seed <n>] [--tap-ms <ms>] [--portal-max <min>] [--ascend-max <min>] [--budget <min>]

Starts a fresh seed, presses Space every --tap-ms (default 300, about the
momentum-sustaining rate), takes the game's own Best value pick every few
seconds (any green row when it has none), enters the portal the moment it opens, and keeps striking until the
realm name changes. Exits non-zero if the portal takes longer than
--portal-max (default 20) or ascension longer than --ascend-max (default 30).`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
  return v;
};
const port = resolvePort(argv);
const seed = flag('seed', String(Date.now() % 100000));
const tapMs = Number(flag('tap-ms', '300'));
const portalMaxSec = Number(flag('portal-max', '20')) * 60;
const ascendMaxSec = Number(flag('ascend-max', '30')) * 60;
const budgetSec = Number(flag('budget', '40')) * 60;
await requireServer(port);

const steps = [];
const consoleErrors = [];
const report = (extra = {}) =>
  console.log(JSON.stringify({ port, seed, tapMs, steps, consoleErrors, ...extra }, null, 2));

try {
  await withBrowser(async (browser) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await page.goto(`http://localhost:${port}/?seed=${seed}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`http://localhost:${port}/?seed=${seed}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /DPS/.test(document.body.innerText || ''), { timeout: 60000 });

    const fail = (why, extra = {}) => {
      throw new ProbeFailure(why, extra);
    };
    const text = () => page.evaluate(() => document.body.innerText || '');
    const realmName = () => page.evaluate(() => document.querySelector('[data-role="region"]')?.textContent ?? null);
    const zoneLabel = async () => (await text()).match(/Zone \d+\/\d+/)?.[0] ?? null;
    const enter = page.locator('[data-role="enter-portal"]');
    const buyable = page.locator('.upgrades .upgrade-btn:not([disabled]):not(.asc-node)');
    const bestBuy = page.locator('[data-role="best-buy"]:not([hidden]):not([disabled])');
    const buyOne = async () => {
      const b = (await bestBuy.isVisible().catch(() => false)) ? bestBuy : buyable.first();
      if (!(await b.isVisible().catch(() => false))) return false;
      await b.click();
      return true;
    };

    const start = Date.now();
    const sec = () => (Date.now() - start) / 1000;
    const realm0 = await realmName();
    let lastZone = await zoneLabel();
    let lastBuy = 0;
    let bought = 0;
    let portalAt = null;
    let enteredAt = null;
    const zones = [];
    let taps = 0;

    while (sec() < budgetSec) {
      await page.keyboard.press('Space');
      taps += 1;
      await page.waitForTimeout(tapMs);

      const z = await zoneLabel();
      if (z && z !== lastZone) {
        zones.push({ zone: z, atSec: Math.round(sec()) });
        lastZone = z;
      }
      if (enteredAt === null && sec() - lastBuy > 4) {
        lastBuy = sec();
        for (let i = 0; i < 12; i++) {
          if (!(await buyOne())) break;
          bought += 1;
        }
      }
      if (portalAt === null && (await enter.isVisible().catch(() => false))) {
        portalAt = sec();
        steps.push(`portal opened at ${(portalAt / 60).toFixed(1)} min after ${bought} purchases`);
        for (let i = 0; i < 30; i++) {
          if (!(await buyOne())) break;
          bought += 1;
        }
        const preview = await page.evaluate(() => document.querySelector('[data-role="portal-eta"]')?.textContent ?? null);
        await enter.click();
        enteredAt = sec();
        steps.push(`entered at ${(enteredAt / 60).toFixed(1)} min with ${bought} purchases; blade-in-hand estimate ${preview}`);
      }
      if (enteredAt !== null) {
        const r = await realmName();
        if (r && r !== realm0) {
          const ascendAt = sec();
          steps.push(`ascended to ${r} at ${(ascendAt / 60).toFixed(1)} min; fight ${((ascendAt - enteredAt) / 60).toFixed(1)} min`);
          steps.push(`real tap rate ${(taps / ascendAt).toFixed(2)}/s against a ${(1000 / tapMs).toFixed(2)}/s setting`);
          if (portalAt > portalMaxSec) fail(`portal took ${(portalAt / 60).toFixed(1)} min, over ${portalMaxSec / 60}`);
          if (ascendAt > ascendMaxSec) fail(`ascension took ${(ascendAt / 60).toFixed(1)} min, over ${ascendMaxSec / 60}`);
          if (consoleErrors.length > 0) fail(`${consoleErrors.length} console errors during the session`);
          report({ zones, bought, portalAt, enteredAt, ascendAt });
          console.log('pass: a first session reached ascension inside the band');
          return;
        }
      }
    }
    fail(`no ascension inside ${budgetSec / 60} min`, { zones, bought, portalAt, enteredAt });
  });
} catch (e) {
  report(e instanceof ProbeFailure ? e.extra : {});
  if (!(e instanceof ProbeFailure)) throw e;
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
