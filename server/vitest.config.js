import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // Each test file gets one in-memory MongoDB; running files in parallel would
    // start several database servers at once for no benefit.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 180_000,
    env: { NODE_ENV: 'test' },
  },
});
