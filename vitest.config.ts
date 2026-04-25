import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Exclude AI eval tests — they run with their own config via npm run test:eval
    exclude: ['tests/ai-eval/**', 'tests/e2e/**', '**/node_modules/**'],
    // Integration tests that dynamically import the full tRPC router
    // (via createTestCaller → @/server/routers/_app) can take >5s to
    // bootstrap under concurrent load — the intelligence.ts router alone
    // is 7000+ lines. Bump from 5s default to 30s so those tests don't
    // flake when the full suite runs. Unit tests still finish in <100ms.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
