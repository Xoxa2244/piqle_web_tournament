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
    // Use child processes instead of worker threads. Default `pool: 'threads'`
    // creates a worker_thread per test file, each holding its own Prisma
    // Client (Rust query engine). When threads exit, the Rust engine can't
    // tear down cleanly and panics with "Failed to deserialize constructor
    // options" → exit code 134 (SIGABRT). All tests pass first; the panic
    // only fires during teardown but still fails CI. With 'forks', each
    // file runs in its own child process and the OS reclaims resources at
    // process exit — no Rust cleanup race. Same parallelism, slightly
    // higher startup overhead (~50ms per file).
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
