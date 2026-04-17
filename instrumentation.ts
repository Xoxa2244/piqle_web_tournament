/**
 * Next.js instrumentation hook
 * Runs once at server startup, BEFORE any request is handled.
 * Used for environment validation and observability setup.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('./lib/env-validation')

    try {
      assertEnv()
      console.log('[startup] Environment validation passed')
    } catch (err) {
      // In production: fail fast — don't let the app start with missing secrets
      if (process.env.NODE_ENV === 'production') {
        console.error((err as Error).message)
        // Exit process so Vercel/container orchestrator knows deploy failed
        process.exit(1)
      } else {
        // In dev: warn but continue
        console.warn('[startup] Environment validation warning:', (err as Error).message)
      }
    }
  }
}
