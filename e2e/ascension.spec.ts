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

test('the Ascendancy tree opens from the Road and closes again', async ({ game }) => {
  await game.openAscendancy.click();

  await expect(game.ascendancy).toBeVisible();
  await expect(game.ascendancy.getByRole('listitem').filter({ hasText: 'realms completed' })).toHaveText(
    /^0\s*realms completed$/,
  );

  await game.ascendancy.getByRole('button', { name: 'Back to the Road' }).click();
  await expect(game.ascendancy).toBeHidden();
});

test('the open tree keeps Tab inside it, so nothing behind it can be bought blind', async ({
  game,
}) => {
  await game.openAscendancy.click();
  await expect(game.ascendancy.getByRole('button', { name: 'Back to the Road' })).toBeFocused();

  expect(await game.tabStopsOutside(game.ascendancy, 12)).toEqual([]);
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

test('victory banks the pending Ascendancy, and the tree spends it', async ({ game }) => {
  await expect(game.openAscendancy).toHaveAccessibleName(/^Ascendancy 0 A · \+\d+$/);

  await fellTheGuardian(game);
  await expect(game.openAscendancy).toHaveAccessibleName(/^Ascendancy [1-9]\d* A$/);
  await game.openAscendancy.click();

  const tally = (label: string) => game.ascendancy.getByRole('listitem').filter({ hasText: label });
  await expect(tally('realms completed')).toHaveText(/^1\s*realms completed$/);
  await expect(tally('gold multiplier')).not.toHaveText(/^1\.00x/);
  const banked = await game.amount(tally('banked to spend').locator('span').first());
  expect(banked).toBeGreaterThan(0);

  const edge = game.ascendancy.getByRole('button', { name: /^Wanderer's Edge/ });
  await expect(edge).toContainText('not yet');
  await edge.click();

  await expect(edge).toContainText(/rank 1, \d+\.\d\dx/);
  await expect
    .poll(() => game.amount(tally('banked to spend').locator('span').first()))
    .toBeLessThan(banked);
});
