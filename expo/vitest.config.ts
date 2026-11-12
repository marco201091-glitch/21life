import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      // Shared domain lives outside the native app; retain its coverage floors.
      allowExternal: true,
      include: ['lib/**/*.ts', path.resolve(__dirname, '../packages/domain/**/*.ts').replaceAll('\\', '/')],
      exclude: ['lib/types/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 55,
        branches: 57,
        functions: 68,
        lines: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
