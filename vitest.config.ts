import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Long-gap tests replay millions of kills on purpose. Five seconds is not
    // a real budget for those; performance.test.ts asserts the actual one.
    testTimeout: 30_000,
  },
});
