import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    root: './src',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
