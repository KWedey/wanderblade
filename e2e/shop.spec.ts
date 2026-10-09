import { expect, test } from './support/fixtures';
import { MINUTE } from './support/wanderblade';

// README walkthrough, step 2: buy hero levels and skills; gear drops as you fight.

test('a hero level costs gold, raises DPS, and the next one costs more', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
  await expect(game.heroLevel).toHaveAccessibleName(/^Hero Lv 15 /);
  const dps = await game.amount(game.dps);
  const price = await game.price(game.heroLevel);

  await game.heroLevel.click();

  await expect(game.heroLevel).toHaveAccessibleName(/^Hero Lv 16 /);
  await expect.poll(() => game.amount(game.dps)).toBeGreaterThan(dps);
  await expect.poll(() => game.price(game.heroLevel)).toBeGreaterThan(price);
});

test('a skill ranks up when bought', async ({ game }) => {
  await game.start({ stage: 'mid', seed: 7 });
  const riposte = game.skill('Riposte');
  await expect(riposte).toContainText('Level 1');

  await riposte.click();

  await expect(riposte).toContainText('Level 2');
});

test('a row that is not yet affordable says when, and is affordable by then', async ({ game }) => {
  await game.start({ seed: 7 });
  const cleave = game.skill('Cleave');
  await expect(cleave).toBeDisabled();
  await expect(cleave).toContainText('in ~1m 00s');

  await game.playFast(MINUTE);

  await expect(cleave).toBeEnabled();
});

test('a locked skill names the hero level that unlocks it', async ({ game }) => {
  await game.start({ seed: 7 });
  const riposte = game.skill('Riposte');
  await expect(riposte).toContainText('Unlocks at Level 2');
  await expect(riposte).toBeDisabled();

  for (const level of [1, 2]) {
    await game.playUntilReady(game.heroLevel, { within: 10 * MINUTE });
    await expect(game.heroLevel).toHaveAccessibleName(new RegExp(`^Hero Lv ${level} `));
    await game.heroLevel.click();
  }

  await expect(riposte).toContainText('Level 0');
  await expect(riposte).not.toContainText('Unlocks');
});

test('the Best value card buys the row it names', async ({ game }) => {
  await game.start({ seed: 7 });
  await game.playFast(MINUTE);
  await expect(game.bestValue).toContainText('Cleave');
  await expect(game.skill('Cleave')).toContainText('Level 0');

  await game.bestValue.click();

  await expect(game.skill('Cleave')).toContainText('Level 1');
});

test('gear drops from kills and fills the empty slots', async ({ game }) => {
  await game.start({ seed: 7 });
  for (const slot of ['weapon', 'armor', 'trinket'] as const) {
    await expect(game.gearSlot(slot)).toContainText('empty');
  }

  await game.playFast(MINUTE);

  await expect(game.gearSlot('weapon')).toContainText(/power \d/);
  await expect(game.gearSlot('armor')).toContainText(/power \d/);
});
