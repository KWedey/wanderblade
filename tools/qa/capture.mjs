#!/usr/bin/env node
// Capture a judged frame from a live dev server.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withBrowser } from './playwright.mjs';
import { DEFAULT_PORT, requireServer, resolvePort } from './port.mjs';

const HELP = `npm run qa:capture -- --label <name> [options]

Answers: what does the game look like right now, at desktop size, mid-swing?

  --label <name>    output basename, required
  --stage <id>      staging preset: fresh | mid | late   (default mid)
  --seed <n>        run seed                             (default 7)
  --taps <n>        strikes before the shot, 90ms apart  (default 24)
  --width <px>      viewport width                       (default 1920)
  --height <px>     viewport height                      (default 1080)
  --port <n>        dev server port          (default ${DEFAULT_PORT}, or $WB_QA_PORT)

Writes <repo>/.gauntlet/ours/<label>.png, relative to the worktree it runs in.`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
  console.log(HELP);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const label = flag('label', argv[0]?.startsWith('--') ? undefined : argv[0]);
if (!label) {
  console.error('--label is required. See --help.');
  process.exit(1);
}
const stage = flag('stage', 'mid');
const seed = flag('seed', '7');
const taps = Number(flag('taps', '24'));
const width = Number(flag('width', '1920'));
const height = Number(flag('height', '1080'));
const port = resolvePort(argv);

const repo = fileURLToPath(new URL('../..', import.meta.url));
const out = join(repo, '.gauntlet', 'ours', `${label}.png`);
mkdirSync(join(repo, '.gauntlet', 'ours'), { recursive: true });

await requireServer(port);
const url = `http://localhost:${port}/?stage=${stage}&seed=${seed}`;
console.log(`capturing ${url} at ${width}x${height}`);

await withBrowser(async (browser) => {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // Staging replays hours of engine time and hundreds of purchases, which outruns
  // any fixed sleep on a loaded machine and lands the shot on a fresh run.
  if (stage !== 'fresh') {
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return !/Zone 1\/\d/.test(t) && /DPS/.test(t);
    }, { timeout: 60000 });
  }
  await page.waitForTimeout(400);

  // Tap fast enough to hold momentum near the ceiling; a judged frame is a hot one.
  for (let i = 0; i < taps; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(60); // land mid-swing rather than on the settle
  writeFileSync(out, await page.screenshot());
});

// A PNG cannot say which branch rendered it. Several dev servers run at once
// here on different worktrees, and reading QA off the wrong port has twice
// invented bugs that did not exist. The server's own checkout is the answer,
// not this script's - they are routinely different.
const sh = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const serverCwd = (() => {
  const pid = sh('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
  if (!pid) return null;
  const line = sh('lsof', ['-a', '-p', pid.split('\n')[0], '-d', 'cwd', '-Fn']);
  return line ? (line.split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? null) : null;
})();
// HEAD is not enough. Two worktrees sharing one branch share its ref, so a
// stale checkout reports the newest commit while serving the old files.
const served = serverCwd
  ? {
      cwd: serverCwd,
      head: sh('git', ['rev-parse', '--short', 'HEAD'], serverCwd),
      branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], serverCwd),
      dirty: (sh('git', ['status', '--porcelain'], serverCwd) || '').split('\n').filter(Boolean).length,
    }
  : null;
const provenance = {
  png: out,
  url,
  port,
  capturedBy: { cwd: repo, head: sh('git', ['rev-parse', '--short', 'HEAD'], repo), branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repo) },
  served,
};
writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(provenance, null, 2));
console.log(`wrote ${out}`);
if (!served) {
  console.log(`served by :${port} — could not resolve the server's checkout`);
} else {
  console.log(`served by ${served.branch}@${served.head}  (${served.cwd})`);
  if (served.dirty > 0) {
    console.log(
      `WARNING: the serving checkout has ${served.dirty} uncommitted paths, so this frame is NOT ${served.head}.`,
    );
  }
  if (served.head !== provenance.capturedBy.head) {
    console.log(
      `WARNING: this frame is ${served.branch}@${served.head}, not the ${provenance.capturedBy.branch}@${provenance.capturedBy.head} you ran from.`,
    );
  }
}
