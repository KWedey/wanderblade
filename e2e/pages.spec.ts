import { expect, test } from './support/fixtures';

// The production build at /wanderblade/, as GitHub Pages serves it: what the
// README's "Play it" link opens. Dev staging and the time-warp bench must be gone.

test('loads every asset from under /wanderblade/', async ({ page }) => {
  const requests: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('requestfailed', (request) => failures.push(request.url()));
  page.on('response', (response) => {
    if (!response.ok()) failures.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Upgrades' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Hero Lv 1 / })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(failures).toEqual([]);
  expect(requests.filter((path) => !path.startsWith('/wanderblade/'))).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('16px "Pixelify Sans"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('16px VT323'))).toBe(true);
});

test('ships the sound toggle but no debug bench', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Settings' }).click();

  await expect(page.getByRole('button', { name: 'Sound: on' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Time-warp/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset save' })).toHaveCount(0);
});

test('ignores dev staging in the URL', async ({ page }) => {
  await page.goto('./?stage=mid&seed=7');

  await expect(page.getByTestId('zone')).toHaveText('Zone 1/10');
  await expect(page.getByRole('button', { name: /^Hero Lv 1 / })).toBeVisible();
});
