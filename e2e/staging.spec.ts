import { expect, test } from './support/fixtures';
import { MINUTE, SECOND } from './support/wanderblade';

// README walkthrough, step 6: `?stage=mid&seed=7` starts deep into a run.
// app/src/devstage.ts lives 25 engine-minutes of realm 0 with real purchases.

test('?stage=mid&seed=7 starts deep into realm 0', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });

  await expect(game.region).toHaveText('Greenwood');
  await expect(game.zone).toHaveText('Zone 9/10');
  await expect(game.heroLevel).toHaveAccessibleName(/^Hero Lv 15 /);
  await expect(game.gearSlot('weapon')).toContainText(/power \d/);
  await expect(game.openAscendancy).toHaveAccessibleName(/^Ascendancy 0 A · \+\d+$/);
});

// The panel only: the world canvas animates on frame timing, and the fake
// clock's performance origin drifts a millisecond or two between runs.
test('?stage=mid&seed=7 paints the same panel every time', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
  await game.page.evaluate(() => document.fonts.ready);
  await game.play(SECOND);

  await expect(game.page.locator('.screen')).toHaveScreenshot('stage-mid-panel.png');
});

test('a staged run never writes over the real save', async ({ game }) => {
  const readSave = () => game.page.evaluate(() => localStorage.getItem('wanderblade-save-v1'));
  await game.start({ seed: 7 });
  await game.playFast(MINUTE);
  await game.start({ stage: 'mid', seed: 7 });
  const realRun = await readSave();
  expect(realRun).toContain('"savedAt"');

  await game.playFast(MINUTE);
  await game.page.reload();

  expect(await readSave()).toBe(realRun);
});

test('?seed= starts a fresh run on that seed', async ({ game }) => {
  await game.page.goto('./?seed=7');

  await expect(game.seed).toHaveText('7');
  await expect(game.zone).toHaveText('Zone 1/10');
  await expect(game.heroLevel).toContainText(/Hero Lv 1\b/);
});
