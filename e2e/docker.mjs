#!/usr/bin/env node
// The e2e suite in CI's image and CPU architecture, so screenshots match CI's
// renderer. `npm run e2e:docker -- --update-snapshots` regenerates baselines.
// Linux node_modules live in a named volume: the host's are built for the host.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.devDependencies['@playwright/test'];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`@playwright/test must be pinned to an exact version to pick its image; found ${version}`);
  process.exit(1);
}
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const quoted = process.argv.slice(2).map((arg) => `'${arg.replaceAll("'", "'\\''")}'`);

const { status, error } = spawnSync(
  'docker',
  [
    'run', '--rm', '--init', '--ipc=host',
    // CI runs on x86-64; Skia rasterises differently on arm64.
    '--platform', 'linux/amd64',
    '-v', `${repo}:/work`,
    '-v', 'wanderblade-e2e-node-modules:/work/node_modules',
    '-w', '/work',
    image,
    'bash', '-c', `npm ci --no-audit --no-fund && npx playwright test ${quoted.join(' ')}`,
  ],
  { stdio: 'inherit' },
);
if (error) {
  console.error(`could not run docker: ${error.message}`);
  process.exit(1);
}
process.exit(status ?? 1);
