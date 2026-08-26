import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Long-gap tests replay millions of kills on purpose: the many-way split
    // across a ten-day gap is ~40s of real work on its own. This is headroom
    // for a loaded machine, not a budget; performance.test.ts asserts the
    // scaling invariant that actually matters.
    testTimeout: 180_000,
  },
});
