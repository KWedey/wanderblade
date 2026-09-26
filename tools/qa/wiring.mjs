// Does the live page actually listen to what the rules module expects?
//
// hold.ts owns "where a held strike lands" and four unit tests pin the rule.
// None of them can see whether view.ts registers the pointermove listener at
// all, and that is the half that shipped broken: a held thumb kept striking
// the point it first touched. Reads the registered listeners out of the
// debugger, because dispatching an event and watching it propagate proves
// nothing — propagation does not depend on anyone listening.

import { ProbeFailure, withBrowser } from './playwright.mjs';
import { requireServer, resolvePort } from './port.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Wanderblade wiring probe — proves the page listens, not just that the rule is right

  npm run qa:wiring -- [--port <n>]

Exits non-zero if a held strike ignores the pointer moving.`);
  process.exit(0);
}
const port = resolvePort(argv);
await requireServer(port);

const held = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
let kinds;
try {
  kinds = await withBrowser(async (browser) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(`http://localhost:${port}/?stage=mid&seed=7`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /DPS/.test(document.body.innerText || ''), { timeout: 60000 });

    // Ask the debugger which listeners are actually registered on window. This is
    // the only honest answer: dispatching a pointermove and watching it propagate
    // proves nothing, because propagation happens whether or not anyone listens.
    const cdp = await page.context().newCDPSession(page);
    const kindsNow = async () => {
      const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
      return listeners.map((l) => l.type);
    };

    // A probe that has only ever passed is indistinguishable from one that cannot
    // fail. Round-trip a type nobody registers: absent before, present after.
    const CANARY = 'wanderblade-qa-canary';
    const before = await kindsNow();
    if (before.includes(CANARY)) throw new ProbeFailure(`selftest: ${CANARY} was already registered.`);
    await page.evaluate((t) => window.addEventListener(t, () => {}), CANARY);
    const after = await kindsNow();
    if (!after.includes(CANARY)) {
      throw new ProbeFailure('selftest: the listener read cannot see a listener that was just added.');
    }
    return after;
  });
} catch (e) {
  if (!(e instanceof ProbeFailure)) throw e;
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
const missing = held.filter((t) => !kinds.includes(t));

const report = { port, registered: kinds.filter((t) => held.includes(t)), missing };
console.log(JSON.stringify(report, null, 2));
if (missing.length > 0) {
  console.error(`FAIL: window has no listener for ${missing.join(', ')} — a held strike cannot follow the thumb.`);
  process.exit(1);
}
console.log('pass: every listener a held strike depends on is registered on window');
