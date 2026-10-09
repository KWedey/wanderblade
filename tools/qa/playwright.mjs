// How every QA probe gets its browser: the repo's own `playwright` first,
// `dev-browser`'s global copy second. The two are different Playwright
// versions with different Chromium revisions, so an install only counts when
// its own browser is on disk.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Playwright entry points that exist on disk, best first. */
export function playwrightCandidates({ home = homedir(), local = tryLocal } = {}) {
  const fromDevBrowser = join(home, '.dev-browser', 'node_modules', 'playwright', 'index.js');
  return [local(), existsSync(fromDevBrowser) ? fromDevBrowser : null].filter(Boolean);
}

function tryLocal() {
  try {
    return require.resolve('playwright');
  } catch {
    return null;
  }
}

async function importEntry(entry) {
  const mod = await import(pathToFileURL(entry).href);
  return mod.default ?? mod;
}

/** The first install whose Chromium is downloaded; the error names what to run otherwise. */
export async function loadPlaywright({ load = importEntry, ...where } = {}) {
  const candidates = playwrightCandidates(where);
  if (candidates.length === 0) {
    throw new Error(
      'playwright not found. Run `npm install` here, or `npm i -g dev-browser && dev-browser install`.',
    );
  }
  const missing = [];
  for (const entry of candidates) {
    const pw = await load(entry);
    const exe = pw.chromium.executablePath();
    if (existsSync(exe)) return pw;
    missing.push(`${entry} expects ${exe}`);
  }
  throw new Error(
    `playwright is installed but its Chromium is not:\n  ${missing.join('\n  ')}\nRun \`npx playwright install chromium\`.`,
  );
}

/** A probe verdict, as distinct from a crash: printed as one FAIL line, never a stack trace. */
export class ProbeFailure extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.extra = extra;
  }
}

const ORPHAN_GUARD = `
const [parent, browser] = process.argv.slice(1).map(Number);
setInterval(() => {
  try { process.kill(parent, 0); } catch {
    try { process.kill(-browser, 'SIGKILL'); } catch {}
    process.exit(0);
  }
}, 500);
`;

/**
 * Kills the browser's process group once this process is gone. Playwright's own
 * hooks close the browser on return, throw, exit and Ctrl-C; a SIGKILL — a tool
 * timeout, `kill -9` — runs no hook, and the browser is a detached group leader
 * that would outlive us. Returns the disarm.
 */
export function guardOrphan(browserPid, parentPid = process.pid) {
  const guard = spawn(process.execPath, ['-e', ORPHAN_GUARD, String(parentPid), String(browserPid)], {
    detached: true,
    stdio: 'ignore',
  });
  guard.on('error', () => {});
  guard.unref();
  return () => {
    guard.kill();
  };
}

/** Runs `fn` against a headless Chromium that cannot outlive the script. */
export async function withBrowser(fn, launch = {}) {
  const { chromium } = await loadPlaywright();
  // launchServer rather than launch: only a BrowserServer exposes the pid the guard watches.
  const server = await chromium.launchServer({ headless: true, ...launch });
  const disarm = guardOrphan(server.process().pid);
  let closing = null;
  const close = () => (closing ??= server.close().catch(() => {}).finally(disarm));
  // Playwright closes the browser on SIGINT and exits 130 itself; on SIGTERM it only closes.
  const onTerm = () => {
    close().finally(() => process.exit(143));
  };
  process.once('SIGTERM', onTerm);
  try {
    return await fn(await chromium.connect(server.wsEndpoint()));
  } finally {
    process.off('SIGTERM', onTerm);
    await close();
  }
}
