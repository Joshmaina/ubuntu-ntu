import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      // NFR-061: enforced, not merely reported. FSRS is the component most
      // likely to be silently wrong, so a coverage regression must fail CI.
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
