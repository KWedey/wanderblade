import { test as base, expect } from '@playwright/test';
import { Wanderblade } from './wanderblade';

/** Every run boots at this instant, so a save's `savedAt` and every gap are exact. */
export const EPOCH = new Date('2026-06-01T09:00:00Z');

interface Fixtures {
  /** The game with its clock frozen at EPOCH. */
  game: Wanderblade;
  /** Uncaught exceptions and console errors; any at all fails the test. */
  pageErrors: string[];
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
      expect(errors, 'the page reported errors').toEqual([]);
    },
    { auto: true },
  ],

  game: async ({ page, hasTouch }, use) => {
    await page.clock.install({ time: EPOCH });
    await page.clock.pauseAt(EPOCH);
    await use(new Wanderblade(page, hasTouch));
  },
});

export { expect };
