import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Report-only (AD-003): no thresholds, so `test:coverage` never fails the
    // build — it just surfaces which logic modules are under-tested. Scoped to
    // the layers that carry unit tests; renderer components and thin OS/Electron
    // shells are intentionally uncovered by convention.
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'text-summary']
    }
  }
})
