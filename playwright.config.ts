import { defineConfig, devices } from '@playwright/test';

/**
 * Device names are case-sensitive, and a miss is `undefined`, which spreads to
 * nothing and quietly runs the "phone" at 1280px. Fail at load instead.
 */
function device(name: string): (typeof devices)[string] {
  const descriptor = devices[name];
  if (!descriptor) throw new Error(`Unknown Playwright device "${name}" (names are case-sensitive)`);
  return descriptor;
}

const CI = Boolean(process.env.CI);
// Off Vite's defaults, and strict: a server another checkout left running on
// the port fails the run instead of being the thing under test.
const DEV_PORT = Number(process.env.E2E_PORT ?? 5287);
const PAGES_PORT = DEV_PORT + 1;

export default defineConfig({
  testDir: 'e2e',
  // Baselines come only from the Linux image CI runs in (npm run e2e:docker),
  // so the path carries no platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: CI,
  // The clock is fake and every run is seeded: a retry could only hide a flake.
  retries: 0,
  workers: CI ? 2 : '50%',
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    testIdAttribute: 'data-role',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: 'pages.spec.ts',
      use: { ...device('Desktop Chrome'), baseURL: `http://localhost:${DEV_PORT}/` },
      metadata: { width: 1280, coarsePointer: false },
    },
    {
      name: 'phone',
      testIgnore: 'pages.spec.ts',
      use: { ...device('Pixel 7'), baseURL: `http://localhost:${DEV_PORT}/` },
      metadata: { width: 412, coarsePointer: true },
    },
    {
      // The production build exactly as GitHub Pages serves it, on a phone.
      name: 'pages',
      testMatch: 'pages.spec.ts',
      use: { ...device('Pixel 7'), baseURL: `http://localhost:${PAGES_PORT}/wanderblade/` },
    },
  ],
  webServer: [
    {
      command: `npm run -w app dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/`,
      reuseExistingServer: false,
    },
    {
      command: `npm run build:pages && npm run -w app preview:pages -- --port ${PAGES_PORT} --strictPort`,
      url: `http://localhost:${PAGES_PORT}/wanderblade/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
