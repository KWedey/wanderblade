import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolvePlaywright } from './playwright.mjs';

const fakeHomes = [];
afterEach(() => fakeHomes.splice(0).forEach((h) => rmSync(h, { recursive: true, force: true })));

// A home with, or without, a dev-browser copy of playwright inside it.
const homeWith = (installed) => {
  const home = mkdtempSync(join(tmpdir(), 'wb-qa-home-'));
  fakeHomes.push(home);
  if (installed) {
    const dir = join(home, '.dev-browser', 'node_modules', 'playwright');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.js'), 'export default {};\n');
  }
  return home;
};

describe('where the QA tools get their browser from', () => {
  it('prefers the repo install when one resolves', () => {
    const entry = resolvePlaywright({ home: homeWith(true), local: () => '/repo/node_modules/playwright/index.js' });
    expect(entry).toBe('/repo/node_modules/playwright/index.js');
  });

  it('falls back to dev-browser when the repo has none', () => {
    const home = homeWith(true);
    const entry = resolvePlaywright({ home, local: () => null });
    expect(entry).toBe(join(home, '.dev-browser', 'node_modules', 'playwright', 'index.js'));
  });

  it('returns null when neither exists, so the caller can say what to install', () => {
    expect(resolvePlaywright({ home: homeWith(false), local: () => null })).toBeNull();
  });

  it('finds a real module on this machine by at least one path', () => {
    const entry = resolvePlaywright();
    expect(entry).not.toBeNull();
    expect(existsSync(entry)).toBe(true);
  });
});
