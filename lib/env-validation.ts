/**
 * Environment Variable Validation
 *
 * Fails fast at startup in production if required env vars are missing.
 * Prevents silent failures from missing secrets (e.g. agent HMAC tokens
 * falling back to predictable values).
 *
 * Called from instrumentation.ts (Next.js register hook).
 */

// Variables that MUST be set in production — app cannot function safely without them
const REQUIRED_PROD_ENV = [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXTAUTH_SECRET',
  'CRON_SECRET',
  'CONNECTOR_ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const

// Variables that SHOULD be set in production — app runs but features degrade
const RECOMMENDED_PROD_ENV = [
  'MAILCHIMP_TRANSACTIONAL_API_KEY',
  'MAILCHIMP_WEBHOOK_KEY',
  'TWILIO_AUTH_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SENTRY_DSN',
  'NEXT_PUBLIC_APP_URL',
  // Rate limiting (Upstash Redis) — without these, rate limits silently disable
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

// Secrets that must not use weak defaults
const WEAK_SECRETS = ['fallback', 'changeme', 'secret', 'test', 'dev', 'default']

function hasWeakValue(value: string): boolean {
  const lower = value.toLowerCase()
  return WEAK_SECRETS.some((weak) => lower.includes(weak)) || value.length < 16
}

export interface EnvValidationResult {
  valid: boolean
  missing: string[]
  weak: string[]
  warnings: string[]
}

export function validateEnv(): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    missing: [],
    weak: [],
    warnings: [],
  }

  // Only enforce strict validation in production
  if (process.env.NODE_ENV !== 'production') {
    return result
  }

  // Check required vars
  for (const key of REQUIRED_PROD_ENV) {
    const value = process.env[key]
    if (!value || value.trim() === '') {
      result.missing.push(key)
      result.valid = false
    } else if (
      (key === 'CRON_SECRET' ||
        key === 'NEXTAUTH_SECRET' ||
        key === 'CONNECTOR_ENCRYPTION_KEY') &&
      hasWeakValue(value)
    ) {
      result.weak.push(key)
      result.valid = false
    }
  }

  // Check recommended vars — warnings only
  for (const key of RECOMMENDED_PROD_ENV) {
    if (!process.env[key]) {
      result.warnings.push(`Recommended env var ${key} is not set — related features will be degraded`)
    }
  }

  return result
}

/**
 * Call at server startup. Throws if required vars missing in production.
 * In development, logs warnings but does not throw.
 */
export function assertEnv(): void {
  const result = validateEnv()

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`[env] ${warning}`)
    }
  }

  if (!result.valid) {
    const errors: string[] = []
    if (result.missing.length > 0) {
      errors.push(`Missing required env vars: ${result.missing.join(', ')}`)
    }
    if (result.weak.length > 0) {
      errors.push(
        `Weak values detected for: ${result.weak.join(', ')} (must be at least 16 chars and not contain "fallback", "test", "dev", etc)`,
      )
    }
    throw new Error(`[env] Production env validation failed:\n  - ${errors.join('\n  - ')}`)
  }
}
