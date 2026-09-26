// The repo's own `playwright` is preferred; `dev-browser`'s global copy is the
// fallback so a machine that never ran `npm install` here can still probe.
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Absolute path to a playwright entry, or null when neither install exists. */
export function resolvePlaywright({ home = homedir(), local = tryLocal } = {}) {
  const fromRepo = local();
  if (fromRepo) return fromRepo;
  const fromDevBrowser = join(home, '.dev-browser', 'node_modules', 'playwright', 'index.js');
  return existsSync(fromDevBrowser) ? fromDevBrowser : null;
}

function tryLocal() {
  try {
    return require.resolve('playwright');
  } catch {
    return null;
  }
}

export async function loadPlaywright(opts) {
  const entry = resolvePlaywright(opts);
  if (!entry) {
    throw new Error(
      'playwright not found. Run `npm install` here, or `npm i -g dev-browser && dev-browser install`.',
    );
  }
  const mod = await import(`file://${entry}`);
  return mod.default ?? mod;
}

/**
 * Runs `fn` against a headless Chromium and closes it no matter how `fn` ends:
 * return, throw, or a Ctrl-C. A browser that outlives its script is how this
 * machine has sat at load 40 with nothing running.
 */
export async function withBrowser(fn, launch = {}) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, ...launch });
  let closing = null;
  const close = () => (closing ??= browser.close().catch(() => {}));
  const onSignal = (signal) => {
    close().finally(() => process.exit(128 + (signal === 'SIGINT' ? 2 : 15)));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn(browser);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await close();
  }
}

const pw = await loadPlaywright();
export const { chromium, devices } = pw;
