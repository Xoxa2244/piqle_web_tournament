import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Connection-pool tuning is configured via DATABASE_URL query params, not
// Prisma client options — see .env.example for the recommended pattern:
//   ?pgbouncer=true&connection_limit=1&pool_timeout=10&connect_timeout=5
//
// • pgbouncer=true       → disables prepared-statement caching (required
//                           for transaction-mode pooler)
// • connection_limit=1   → one DB connection per lambda (each Vercel
//                           function serves one request at a time, so
//                           the default of 2*cpu+1 just wastes pgbouncer
//                           slots and starves other lambdas)
// • pool_timeout=10      → fail in 10s if no connection becomes
//                           available, instead of waiting up to 30s
//                           and letting Vercel kill the function
// • connect_timeout=5    → cap the initial TCP+TLS handshake to 5s

const isDev = process.env.NODE_ENV !== 'production'

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
    },
  },
  // In dev, surface slow queries to the console so we can spot
  // regressions locally. In prod, only log errors to avoid log spam.
  log: isDev
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [{ emit: 'stdout', level: 'error' }],
})

if (isDev) {
  // Log any query that takes longer than 500ms — helps catch N+1 and
  // unbounded findMany early. Cast because the typed `$on('query')` is
  // only available when the `query` event was registered above.
  ;(prisma as unknown as { $on: (e: string, cb: (e: { duration: number; query: string; params: string }) => void) => void })
    .$on('query', (e) => {
      if (e.duration >= 500) {
        // eslint-disable-next-line no-console
        console.warn(`[prisma] slow query ${e.duration}ms — ${e.query.slice(0, 200)}`)
      }
    })
  globalForPrisma.prisma = prisma
}
