import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['./src/**/*.test.{ts,tsx}'],
    coverage: {
      exclude: ['constants/**', '**/types/**', '**/*types.ts', '**/*.d.{ts,tsx}', ...coverageConfigDefaults.exclude],
    },
  },
});
