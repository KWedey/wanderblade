import { expect, test } from './support/fixtures';
import { SECOND } from './support/wanderblade';

// README walkthrough, steps 2-3: the Road reaches its portal, the hero commits
// to the guardian, and a deliberate hold walks away from it.

test.beforeEach(async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
});

test('the Road ends at a portal that opens on its own', async ({ game }) => {
  await expect(game.enterPortal).toBeHidden();

  await game.walkToPortal();

  await expect(game.zone).toHaveText('Portal reached');
  await expect(game.portalOpen).toBeVisible();
  await expect(game.guardianName).toHaveText('the Greenwood Warden');
  await expect(game.page.getByText('Blade in hand')).toBeVisible();
});

test('entering commits to the guardian, which pays no gold', async ({ game }) => {
  await game.walkToPortal();

  await game.enterPortal.click();

  await expect(game.zone).toHaveText('In the Portal');
  await expect(game.page.getByText('Guardian', { exact: true })).toBeVisible();
  await expect(game.enterPortal).toBeHidden();
  await expect(game.abandon).toBeVisible();
  await expect(game.goldRate).toHaveText('+0.0/s');
  await expect(game.log.first()).toContainText('turns to face you');
});

test('striking drives the blade into the guardian faster than idling', async ({ game }) => {
  await game.walkToPortal();
  await game.enterPortal.click();
  const atEntry = await game.amount(game.bossRemaining);

  await game.play(5 * SECOND);
  const afterIdle = await game.amount(game.bossRemaining);
  await game.holdSpace(5 * SECOND);
  const afterStriking = await game.amount(game.bossRemaining);

  expect(atEntry - afterIdle).toBeGreaterThan(0);
  expect(afterIdle - afterStriking).toBeGreaterThan(atEntry - afterIdle);
});

test('a tap on Abandon does nothing; a full hold walks away', async ({ game }) => {
  await game.walkToPortal();
  await game.enterPortal.click();

  await game.holdAbandon(400);
  await expect(game.zone).toHaveText('In the Portal');
  await expect(game.abandon).toBeVisible();

  await game.holdAbandon(SECOND);
  await expect(game.bossHolds).toBeVisible();
  await expect(game.zone).toHaveText('Portal reached');
  await expect(game.enterPortal).toBeVisible();
});
