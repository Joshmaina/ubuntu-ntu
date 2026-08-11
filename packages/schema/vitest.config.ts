import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Table definitions are declarative — exercised by the migrate/seed gate
      // against a real database, not by unit tests. The contracts carry the
      // logic worth covering, so only they are held to a threshold.
      include: ['src/contracts.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
