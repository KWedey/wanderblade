import { test as base, expect, type Page } from '@playwright/test';
import { Wanderblade } from './wanderblade';

/** Every run boots at this instant, so a save's `savedAt` and every gap are exact. */
export const EPOCH = new Date('2026-06-01T09:00:00Z');

interface Fixtures {
  /** The game with its clock frozen at EPOCH. */
  game: Wanderblade;
  /** A second game in its own browser context: its own save, its own clock. */
  secondGame: Wanderblade;
  /** Uncaught exceptions and console errors from every page; any at all fails the test. */
  pageErrors: string[];
}

function collectErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

/**
 * An installed clock runs until paused, and pausing at a past instant throws.
 * Installing a minute early leaves headroom on a slow runner, and pauseAt lands
 * on EPOCH exactly however long the install took.
 */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: EPOCH.getTime() - 60_000 });
  await page.clock.pauseAt(EPOCH);
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      collectErrors(page, errors);
      await use(errors);
      expect(errors, 'the page reported errors').toEqual([]);
    },
    { auto: true },
  ],

  game: async ({ page, hasTouch }, use) => {
    await freezeClock(page);
    await use(new Wanderblade(page, hasTouch));
  },

  secondGame: async (
    { browser, baseURL, viewport, hasTouch, isMobile, deviceScaleFactor, userAgent, pageErrors },
    use,
  ) => {
    const context = await browser.newContext({
      baseURL,
      viewport,
      hasTouch,
      isMobile,
      deviceScaleFactor,
      userAgent,
    });
    const page = await context.newPage();
    collectErrors(page, pageErrors);
    await freezeClock(page);
    await use(new Wanderblade(page, hasTouch));
    await context.close();
  },
});

export { expect };
