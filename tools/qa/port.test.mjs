import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT, resolvePort } from './port.mjs';

const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

describe('which server a QA tool measures', () => {
  it('lets an explicit flag win', () => {
    expect(resolvePort(['--port', '5320'], { WB_QA_PORT: '5199' })).toBe(5320);
  });

  it('falls back to the environment before the default', () => {
    expect(resolvePort([], { WB_QA_PORT: '5199' })).toBe(5199);
    expect(resolvePort([], {})).toBe(DEFAULT_PORT);
  });

  it('reaches the default when the flag is passed with nothing after it', () => {
    expect(resolvePort(['--port'], {})).toBe(DEFAULT_PORT);
  });

  // The regression this exists for is not a port bug, it is a documentation bug:
  // typegrid.test.ts pinned a viewport as a literal and went on passing after the
  // thing it described moved. A default quoted by hand does the same.
  it.each(['capture.mjs', 'mobile.mjs'])('quotes the real default in %s --help', (tool) => {
    const help = /const HELP = `([\s\S]*?)`;/.exec(read(tool));
    expect(help, `${tool} has no HELP block`).not.toBeNull();
    expect(help[1], `${tool} help text hardcodes a port`).not.toMatch(/default \d{4}, or \$WB_QA_PORT/);
    expect(help[1]).toContain('${DEFAULT_PORT}');
  });
});
