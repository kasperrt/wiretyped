import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    environment: 'node',
  },
});
