import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))

// React's cache() only exists in the react-server build that Next.js
// resolves for Server Components. Vitest's node environment resolves the
// client build, where it's undefined — so any module importing
// server/trpc.ts (the whole intelligence router) crashes on load with
// "cache is not a function". Memoization is irrelevant in tests; fall
// back to identity.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: (actual as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn),
  }
})
