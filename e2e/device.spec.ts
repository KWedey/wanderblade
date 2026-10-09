import { expect, test } from './support/fixtures';

// A misspelt device name in playwright.config.ts falls back to a 1280px
// desktop, and the "phone" run would pass while testing no phone at all.
test('runs at the width and pointer its project promises', async ({ game }, testInfo) => {
  const { width, coarsePointer } = testInfo.project.metadata as {
    width: number;
    coarsePointer: boolean;
  };
  await game.start({ seed: 7 });

  expect(await game.page.evaluate(() => window.innerWidth)).toBe(width);
  expect(await game.page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarsePointer);
});

test('fits the screen without sideways scrolling', async ({ game }) => {
  await game.start({ seed: 7 });

  const overflow = await game.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBe(0);
});
