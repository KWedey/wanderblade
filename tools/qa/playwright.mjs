// Playwright is not a repo dependency — the browser download is far heavier
// than three QA scripts justify. It comes from the `dev-browser` CLI, which the
// project already requires for any browser work.
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const entry = join(homedir(), '.dev-browser', 'node_modules', 'playwright', 'index.js');
if (!existsSync(entry)) {
  console.error(
    `playwright not found at ${entry}\n` +
      "These tools drive the browser through dev-browser's copy. Install it with " +
      "'npm i -g dev-browser && dev-browser install', then retry.",
  );
  process.exit(1);
}

const mod = await import(`file://${entry}`);
export const { chromium, devices } = mod.default ?? mod;
