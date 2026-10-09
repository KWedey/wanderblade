import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/args';
import { simulateSeed } from '../src/simulateSeed';
import type { SimConfig } from '../src/types';

// The economy contract is part of the gate. Three days of one seed is the
// shortest run that measures every validator.
describe('the economy simulator is ALL PASS on its shortest full run', () => {
  const config: SimConfig = { ...DEFAULTS, days: 3, seeds: 1 };

  it('measures all 20 validators and every one passes', () => {
    const r = simulateSeed(config.seed, config);
    const all = [...r.correctness, ...r.pacing];
    expect(all.map((v) => v.id)).toHaveLength(20);
    expect(all.filter((v) => v.skipped).map((v) => v.id), 'skipped validators').toEqual([]);
    const failed = all.filter((v) => !v.pass).map((v) => `${v.id} ${v.name}: ${v.detail}`);
    expect(failed, `failing validators:\n${failed.join('\n')}`).toEqual([]);
  });
});
