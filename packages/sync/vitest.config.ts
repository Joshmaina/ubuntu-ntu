import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // types.ts and index.ts are declarations and re-exports — no runtime code
      // to cover, so including them would report a meaningless 0%.
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/types.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
