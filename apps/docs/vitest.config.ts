import { defineConfig } from 'vitest/config';

// jsdom environment used by browser-facing packages
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // Prompt 01 scaffold coverage surface is limited to the canonical
      // entry points (and the bin stub for packages that declare one); each
      // downstream prompt expands this include list once it lands real code.
      include: ['src/index.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.{ts,tsx}',
        'src/app.{ts,tsx}',
        'src/cli.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
