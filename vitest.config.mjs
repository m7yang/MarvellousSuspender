import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // The fork's existing kebab-case tests use Node's built-in runner.
    exclude: ['tests/*-*.test.js'],
    setupFiles: ['tests/setup/chrome-stub.js'],
  },
});
