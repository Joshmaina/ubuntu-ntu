import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    // Integration tests share one Postgres; running files in parallel would
    // interleave writes. Each test creates its own user, so isolation holds
    // within a file, but the file itself runs alone.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
