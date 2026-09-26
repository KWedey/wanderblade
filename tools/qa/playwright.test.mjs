import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadPlaywright, playwrightCandidates } from './playwright.mjs';

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
const devBrowserEntry = (home) => join(home, '.dev-browser', 'node_modules', 'playwright', 'index.js');
const REPO = '/repo/node_modules/playwright/index.js';

describe('where the QA tools get their browser from', () => {
  it('lists the repo install ahead of dev-browser', () => {
    const home = homeWith(true);
    expect(playwrightCandidates({ home, local: () => REPO })).toEqual([REPO, devBrowserEntry(home)]);
  });

  it('lists only dev-browser when the repo has none', () => {
    const home = homeWith(true);
    expect(playwrightCandidates({ home, local: () => null })).toEqual([devBrowserEntry(home)]);
  });

  it('lists nothing when neither exists, and loading says what to install', async () => {
    const home = homeWith(false);
    expect(playwrightCandidates({ home, local: () => null })).toEqual([]);
    await expect(loadPlaywright({ home, local: () => null })).rejects.toThrow(/npm install/);
  });

  it('skips an install whose Chromium was never downloaded and takes the next one', async () => {
    const home = homeWith(true);
    const downloaded = devBrowserEntry(home);
    // Any file that exists stands in for a Chromium binary; a path that does not, for a missing one.
    const load = async (entry) => ({
      entry,
      chromium: { executablePath: () => (entry === downloaded ? downloaded : join(home, 'no-chromium')) },
    });
    const pw = await loadPlaywright({ home, local: () => REPO, load });
    expect(pw.entry).toBe(downloaded);
  });

  it('names the missing browser and the command that installs it', async () => {
    const home = homeWith(true);
    const load = async () => ({ chromium: { executablePath: () => join(home, 'no-chromium') } });
    await expect(loadPlaywright({ home, local: () => null, load })).rejects.toThrow(
      /npx playwright install chromium/,
    );
  });

  it('finds a real module on this machine by at least one path', () => {
    const [entry] = playwrightCandidates();
    expect(entry).toBeDefined();
    expect(existsSync(entry)).toBe(true);
  });
});

describe('a browser cannot outlive the script that launched it', () => {
  const spawned = [];
  afterEach(() => {
    for (const { child, group } of spawned.splice(0)) {
      if (group) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
      child.kill('SIGKILL');
    }
  });
  const idle = (args, group) => {
    const child = spawn(process.execPath, [...args, '-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: group,
    });
    spawned.push({ child, group });
    return child;
  };

  it('kills the browser process group when the script is SIGKILLed', async () => {
    // A stand-in browser: a detached group leader, the way Playwright launches Chromium.
    const browser = idle([], true);
    const exited = new Promise((resolve) => browser.once('exit', (_code, signal) => resolve(signal)));
    // A stand-in script: arms the guard, then idles until killed the way a tool timeout kills it.
    const mod = new URL('./playwright.mjs', import.meta.url).href;
    const script = spawn(
      process.execPath,
      ['--input-type=module', '-e', `import { guardOrphan } from ${JSON.stringify(mod)}; guardOrphan(${browser.pid}); setInterval(() => {}, 1000);`],
      { stdio: 'ignore' },
    );
    spawned.push({ child: script, group: false });
    await new Promise((r) => setTimeout(r, 1000));
    script.kill('SIGKILL');
    const survived = new Promise((_, reject) => setTimeout(() => reject(new Error('browser survived 5s')), 5000));
    await expect(Promise.race([exited, survived])).resolves.toBe('SIGKILL');
  });
});
