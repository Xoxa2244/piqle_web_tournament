/**
 * tRPC Test Caller Helper
 *
 * Builds an `appRouter.createCaller(ctx)` instance with a fake session + mock
 * prisma client so we can test the FULL tRPC → service → lib chain end-to-end.
 *
 * Why this exists (the subtle bug class it catches):
 *   Unit tests on `lib/ai/*` pass → CI green → but the tRPC procedure might
 *   call a different, simpler function or forget to pass through important
 *   fields. Integration tests call the procedure via appRouter and assert
 *   the full chain behaves correctly.
 *
 * Usage:
 *   const caller = createTestCaller({
 *     userId: 'user-1',
 *     prismaOverrides: { playSession: { findUniqueOrThrow: vi.fn(...) } },
 *   })
 *   const result = await caller.intelligence.getSlotFillerRecommendations({...})
 */

import { vi } from 'vitest'
import type { Session } from 'next-auth'

export interface CreateTestCallerOptions {
  /** User id to put in the fake session (default: 'test-user-1') */
  userId?: string
  /** Email for the fake session user */
  email?: string
  /** Whether the user is active (tests the isActive guard). Default: true */
  isActive?: boolean
  /**
   * Per-model prisma mocks. Each entry overrides the default no-op mock
   * (which returns empty/null).
   */
  prismaOverrides?: Record<string, Record<string, ReturnType<typeof vi.fn>>>
  /**
   * Rows to return from `$queryRawUnsafe` / `$queryRaw` calls. Used by procedures
   * that run inline SQL (e.g. the slot-filler fallback in the router).
   */
  rawQueryRows?: any[]
}

/**
 * Build a tRPC caller wired to a mock context.
 *
 * Important: this DOES go through the real router middleware (protectedProcedure,
 * etc.). So your mock prisma must at minimum support `user.findUnique({isActive})`
 * or we override it automatically based on `isActive` option.
 */
export async function createTestCaller(opts: CreateTestCallerOptions = {}) {
  const { appRouter } = await import('@/server/routers/_app')

  const userId = opts.userId || 'test-user-1'
  const email = opts.email || 'test@example.com'
  const isActive = opts.isActive !== false

  const session: Session & { user: { id: string } } = {
    user: {
      id: userId,
      email,
      name: 'Test User',
      image: null,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  // Default no-op mock — returns {} for every prisma method.
  // Tests override specific methods via opts.prismaOverrides.
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop in target) return target[prop]
      const override = opts.prismaOverrides?.[prop as string]
      if (override) return override

      // Default: return a proxy that returns null/[]/noop for any method call
      return new Proxy({}, {
        get: (_t, method) => {
          // Default behaviors per common Prisma method
          if (method === 'findUnique') return vi.fn().mockResolvedValue(null)
          if (method === 'findUniqueOrThrow') return vi.fn().mockRejectedValue(new Error(`prisma.${String(prop)}.findUniqueOrThrow not mocked`))
          if (method === 'findFirst') return vi.fn().mockResolvedValue(null)
          if (method === 'findMany') return vi.fn().mockResolvedValue([])
          if (method === 'count') return vi.fn().mockResolvedValue(0)
          if (method === 'create') return vi.fn().mockResolvedValue({})
          if (method === 'update') return vi.fn().mockResolvedValue({})
          if (method === 'updateMany') return vi.fn().mockResolvedValue({ count: 0 })
          if (method === 'upsert') return vi.fn().mockResolvedValue({})
          if (method === 'delete') return vi.fn().mockResolvedValue({})
          if (method === 'deleteMany') return vi.fn().mockResolvedValue({ count: 0 })
          if (method === 'aggregate') return vi.fn().mockResolvedValue({})
          if (method === 'groupBy') return vi.fn().mockResolvedValue([])
          return vi.fn().mockResolvedValue(null)
        },
      })
    },
  }

  // Always provide user.findUnique for the protectedProcedure isActive check.
  const baseUserMock = {
    findUnique: vi.fn().mockResolvedValue({ isActive }),
    ...(opts.prismaOverrides?.user || {}),
  }

  const rawRows = opts.rawQueryRows ?? []
  const prismaMockBase: any = {
    user: baseUserMock,
    $queryRaw: vi.fn().mockResolvedValue(rawRows),
    $queryRawUnsafe: vi.fn().mockResolvedValue(rawRows),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn().mockImplementation((fn: any) => {
      if (typeof fn === 'function') return fn(prismaMockBase)
      return Promise.all(fn)
    }),
  }

  // Apply overrides on top of base
  if (opts.prismaOverrides) {
    for (const [model, methods] of Object.entries(opts.prismaOverrides)) {
      if (model === 'user') continue // already handled above
      prismaMockBase[model] = {
        findUnique: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockRejectedValue(new Error(`${model}.findUniqueOrThrow not mocked`)),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        ...methods,
      }
    }
  }

  const prisma = new Proxy(prismaMockBase, handler)

  const ctx = {
    session,
    prisma,
  }

  return {
    caller: appRouter.createCaller(ctx as any),
    ctx,
    prisma,
  }
}
