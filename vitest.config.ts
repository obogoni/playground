import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Real-git and real-process suites (worktree-manager, tree, post-create-hook,
    // hook-shell, workflow-loader) routinely take 5-15s per test under parallel
    // load — measured 14 failures in one full run, all duration overruns, on an
    // otherwise untouched tree. A timeout is a ceiling, not a delay: passing
    // tests are unaffected, and this only stops the runner killing work that is
    // merely starved. worktree-manager.test.ts already raised these locally for
    // its base-refresh block; this lifts the same fix to every suite.
    testTimeout: 30000,
    hookTimeout: 30000,
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
