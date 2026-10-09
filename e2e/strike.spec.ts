import { expect, test } from './support/fixtures';
import { MINUTE, SECOND } from './support/wanderblade';

// README walkthrough, step 1: tap or press Space to Strike. Momentum speeds the
// swing, and the HUD's gold rate is where a player sees it.

test('a tap on the road strikes, and momentum lifts the gold rate', async ({ game }) => {
  await game.start({ seed: 7 });
  await expect(game.strikeHint).toBeVisible();
  const idleRate = await game.amount(game.goldRate);

  for (let i = 0; i < 8; i++) {
    await game.tapRoad();
    await game.play(150);
  }

  await expect(game.strikeHint).toBeHidden();
  await expect.poll(() => game.amount(game.goldRate)).toBeGreaterThan(idleRate);
});

test('Space strikes, holding it keeps striking, and momentum fades after', async ({ game }) => {
  await game.start({ seed: 7 });
  const idleRate = await game.amount(game.goldRate);

  await game.strikeWithSpace();
  await expect(game.strikeHint).toBeHidden();

  await game.holdSpace(3 * SECOND);
  const struckRate = await game.amount(game.goldRate);
  expect(struckRate).toBeGreaterThan(idleRate);

  await game.playFast(MINUTE);
  await expect.poll(() => game.amount(game.goldRate)).toBeLessThan(struckRate);
});

test('a tap on empty sky whiffs, and a tap on a falling coin catches it', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
  await game.play(SECOND);

  await game.tapSky();
  await expect(game.scene).toHaveAttribute('data-misses', '1');

  await game.tapAlongLanding(40, 110);
  await expect(game.scene).not.toHaveAttribute('data-catches', '0');
});
