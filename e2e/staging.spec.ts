import { expect, test } from './support/fixtures';

test('?seed= starts a fresh run on that seed', async ({ game }) => {
  await game.page.goto('./?seed=7');

  await expect(game.seed).toHaveText('7');
  await expect(game.zone).toHaveText('Zone 1/10');
  await expect(game.heroLevel).toContainText(/Hero Lv 1\b/);
});
