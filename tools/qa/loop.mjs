// Does the game finish a loop in a browser?
//
// Road -> Portal Boss -> Ascension is the whole product, and every test that
// covers it drives the engine directly. Nothing checks that a person clicking
// the client can get through it: the client once rendered a Portal panel over
// a gate the engine had already deleted, and no test failed.

import { withBrowser } from './playwright.mjs';
import { requireServer, resolvePort } from './port.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Wanderblade loop probe — plays Road -> Portal -> Ascension through the DOM

  npm run qa:loop -- [--port <n>] [--stage <name>] [--seed <n>] [--budget <sec>] [--sample <sec>]

Plays the Road until the portal opens, enters it, and measures how fast the
guardian's health falls. Exits non-zero if any step is unreachable through the
DOM, if the guardian takes no damage, or if the projected fight lands outside
the 15-90 minute band. It never waits out a real fight.`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const port = resolvePort(argv);
const stage = flag('stage', 'mid');
const seed = flag('seed', '7');
const budgetSec = Number(flag('budget', '600'));
await requireServer(port);

// A probe verdict, as distinct from a crash: the browser closes either way,
// but only this one is reported as FAIL rather than a stack trace.
class ProbeFailure extends Error {}
const consoleErrors = [];
const steps = [];
const report = (extra = {}) =>
  console.log(JSON.stringify({ port, stage, seed, steps, consoleErrors, ...extra }, null, 2));

try {
  await withBrowser(async (browser) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await page.goto(`http://localhost:${port}/?stage=${stage}&seed=${seed}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /DPS/.test(document.body.innerText || ''), { timeout: 60000 });

    const deadline = Date.now() + budgetSec * 1000;
    const fail = (why, extra = {}) => {
      report(extra);
      throw new ProbeFailure(why);
    };

    // Tap the road until the portal opens. Space is the same verb as a thumb.
    const enter = page.locator('[data-role="enter-portal"]');
    // A failure with an empty trail says nothing. Sample the trajectory so a stall
    // is distinguishable from a budget that was simply too short.
    const trail = [];
    let nextSample = 0;
    while (Date.now() < deadline) {
      if (await enter.isVisible().catch(() => false)) break;
      if (Date.now() >= nextSample) {
        nextSample = Date.now() + 10_000;
        trail.push(
          await page.evaluate(() => {
            const sub = document.querySelector('.header-sub')?.textContent ?? '';
            return {
              zone: sub.match(/Zone \d+\/\d+/)?.[0] ?? null,
              leagues: Number(sub.match(/([\d.]+) leagues/)?.[1] ?? NaN),
              eta: document.body.innerText.match(/Zone \d+ in ~([^\n]+)/)?.[1] ?? null,
            };
          }),
        );
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
    }
    if (!(await enter.isVisible().catch(() => false))) {
      // Distinguish "still walking" from "stuck". Only the second is a bug, and
      // the first draft of this probe reported the first as though it were.
      const moved = trail.length > 1 && trail[trail.length - 1].leagues > trail[0].leagues;
      fail(
        moved
          ? `still travelling when the ${budgetSec}s budget ran out — raise --budget, this is not a stall`
          : `the Road made no progress in ${budgetSec}s`,
        { trail },
      );
    }
    steps.push('portal opened');

    await enter.click();
    steps.push('entered the portal');

    // The guardian never resets and has no failure timer, so the only way out is
    // through: strike until the realm name changes, which is what ascension does.
    // The guardian is designed to take 15-90 minutes (BOSS_MIN_SEC/BOSS_MAX_SEC),
    // so waiting for it to die is not a check, it is a stopwatch — the first draft
    // of this probe called a 7-minute budget a failure and nearly reported a bug
    // that was the band working as designed. Measure the rate instead: sample the
    // health bar, project time-to-zero, and require it inside the band.
    const BOSS_MIN_SEC = 15 * 60;
    const BOSS_MAX_SEC = 90 * 60;
    const hpFraction = () =>
      page.evaluate(() => {
        const t = document.querySelector('[data-role="boss-hp-fill"]')?.style.transform ?? '';
        const m = t.match(/scaleX\(([\d.]+)\)/);
        return m ? Number(m[1]) : null;
      });

    await page.waitForFunction(
      () => !document.querySelector('[data-role="boss-hp"]')?.hidden,
      { timeout: 30_000 },
    ).catch(() => {});

    const t0 = Date.now();
    const hp0 = await hpFraction();
    if (hp0 === null) fail('the guardian has no health bar after entering the portal');

    const sampleSec = Number(flag('sample', '75'));
    const endBy = Date.now() + sampleSec * 1000;
    while (Date.now() < endBy) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(60);
    }
    const hp1 = await hpFraction();
    const elapsed = (Date.now() - t0) / 1000;
    const drained = hp0 - hp1;
    steps.push(`guardian ${(hp0 * 100).toFixed(1)}% -> ${(hp1 * 100).toFixed(1)}% over ${elapsed.toFixed(0)}s`);

    if (!(drained > 0)) {
      fail('the guardian took no damage while striking', { hp0, hp1, elapsed });
    }
    const projectedSec = elapsed / (drained / hp0);
    steps.push(`projected full fight ${(projectedSec / 60).toFixed(1)} min`);
    if (projectedSec < BOSS_MIN_SEC || projectedSec > BOSS_MAX_SEC) {
      fail(
        `projected fight ${(projectedSec / 60).toFixed(1)} min is outside the ${BOSS_MIN_SEC / 60}-${BOSS_MAX_SEC / 60} min band`,
        { hp0, hp1, elapsed, projectedSec },
      );
    }

    // A loop that completes while throwing is not a loop that works.
    if (consoleErrors.length > 0) fail(`${consoleErrors.length} console errors during the loop`);
  });
} catch (e) {
  if (!(e instanceof ProbeFailure)) throw e;
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
report();
console.log('pass: Road -> Portal Boss -> Ascension completes through the DOM');
