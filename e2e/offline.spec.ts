import { expect, test } from './support/fixtures';
import { HOUR, MINUTE, SECOND } from './support/wanderblade';

// README walkthrough, step 5: offline reconciliation and the return recap.
// A gap is the same engine call as a live tick, reached three ways: a cold
// load from the save, a tab that slept, and the dev time warp.

test.describe('a cold load from the save', () => {
  test.beforeEach(async ({ game }) => {
    await game.start({ seed: 7 });
    await game.playFast(MINUTE);
  });

  test('after eight hours away opens the return recap', async ({ game }) => {
    await game.leaveAndReturnAfter(8 * HOUR);

    await expect(game.recap).toBeVisible();
    await expect(game.recap).toContainText('The hero walked on for 8h 0m.');
    for (const tally of ['leagues traveled', 'monsters felled', 'gold earned']) {
      await expect(game.recapTallies().filter({ hasText: tally })).not.toHaveText(/^0\D/);
    }
  });

  test('takes keyboard focus, so Enter collects it and the Road resumes', async ({ game }) => {
    await game.leaveAndReturnAfter(8 * HOUR);
    const collect = game.recap.getByRole('button', { name: 'Collect & Continue' });
    await expect(collect).toBeFocused();

    await game.page.keyboard.press('Enter');

    await expect(game.recap).toBeHidden();
    const gold = await game.amount(game.gold);
    await game.play(2 * SECOND);
    await expect.poll(() => game.amount(game.gold)).toBeGreaterThan(gold);
  });

  test('under a minute away catches up quietly in the log', async ({ game }) => {
    await game.leaveAndReturnAfter(45 * SECOND);

    await expect(game.log.first()).toHaveText('Caught up 45s on the road.');
    await expect(game.recap).toBeHidden();
  });

  test('and a time warp over the same hour agree to the coin', async ({ game, secondGame }) => {
    await secondGame.start({ seed: 7 });
    await secondGame.playFast(MINUTE);

    await game.leaveAndReturnAfter(HOUR);
    await secondGame.timeWarp('+1h');

    await expect(game.recap).toContainText('The hero walked on for 1h 0m.');
    await expect(secondGame.recap).toContainText('The hero walked on for 1h 0m.');
    await expect(secondGame.recapTallies()).toHaveText(await game.recapTallies().allTextContents());
  });
});

test('a tab that slept is reconciled on its next tick', async ({ game }) => {
  await game.start({ seed: 7 });

  await game.sleep(2 * HOUR);

  await expect(game.recap).toContainText('The hero walked on for 2h 0m.');
});

test('the guardian fight goes on while the hero is away', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
  await game.walkToPortal();
  await game.enterPortal.click();
  const atEntry = await game.amount(game.bossRemaining);

  await game.sleep(2 * MINUTE);
  await expect(game.recapTallies().filter({ hasText: 'bosses slain' })).toHaveText(/^0\s*bosses slain$/);
  await game.recap.getByRole('button', { name: 'Collect & Continue' }).click();

  await expect(game.zone).toHaveText('In the Portal');
  await expect.poll(() => game.amount(game.bossRemaining)).toBeLessThan(atEntry);
});

test('the debug time warp shows the recap card', async ({ game }) => {
  await game.start({ seed: 7 });
  await game.page.evaluate(() => document.fonts.ready);

  await game.timeWarp('+1h');

  await expect(game.recap).toHaveScreenshot('recap-after-time-warp.png');
});
