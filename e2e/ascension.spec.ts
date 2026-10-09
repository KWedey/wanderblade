import { expect, test } from './support/fixtures';
import { SECOND, type Wanderblade } from './support/wanderblade';

// README walkthrough, step 4: win to ascend. The realm resets, Ascendancy
// banks, and the tree opens.

/**
 * Commit a spent build to the guardian and wait it out. The fight runs on the
 * panel's own estimate, then a quarter-second at a time: a guardian that
 * outlives its ETA by more than ten seconds fails here.
 */
async function fellTheGuardian(game: Wanderblade): Promise<void> {
  await game.walkToPortal();
  await game.spendGold();
  await game.enterPortal.click();
  const eta = await game.etaSec();
  await game.playFast((eta - 5) * SECOND);
  await game.playUntilReady(game.victory, { within: 15 * SECOND, step: 250 });
}

test.beforeEach(async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
});

test('felling the guardian ascends the realm and resets the run', async ({ game }) => {
  await expect(game.region).toHaveText('Greenwood');

  await fellTheGuardian(game);

  await expect(game.victory).toBeVisible();
  await expect(game.log.filter({ hasText: 'Slew the Greenwood Warden' })).toHaveCount(1);
  await expect(game.log.filter({ hasText: 'The realm ascends' })).toHaveCount(1);
  await expect(game.region).not.toHaveText('Greenwood');
  await expect(game.zone).toHaveText(/^Zone 1\/\d+$/);
  await expect(game.heroLevel).toHaveAccessibleName(/^Hero Lv 1 /);
  await expect(game.gearSlot('weapon')).toContainText('empty');
});
