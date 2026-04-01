/**
 * Structured Logger — Pino
 *
 * JSON logs in production (Vercel → Datadog/Grafana ready)
 * Pretty print in development
 *
 * Usage:
 *   import { campaignLogger } from '@/lib/logger'
 *   campaignLogger.info({ clubId, userId }, 'Campaign sent')
 *   campaignLogger.error({ err, clubId }, 'Send failed')
 */

import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')

export const logger = pino({
  level,
  ...(isProduction
    ? {} // JSON output for Vercel log drain
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service',
          },
        },
      }),
  base: {
    service: 'iqsport',
    env: process.env.NODE_ENV,
  },
})

// ── Console-compatible wrapper ──
// Allows `log.info('message', arg1, arg2)` like console.log
// while still outputting structured JSON in production

type LogFn = (...args: any[]) => void

interface CompatLogger {
  info: LogFn
  warn: LogFn
  error: LogFn
  debug: LogFn
}

function makeCompat(child: pino.Logger): CompatLogger {
  return {
    info: (...args: any[]) => child.info(args.length === 1 ? args[0] : args.join(' ')),
    warn: (...args: any[]) => child.warn(args.length === 1 ? args[0] : args.join(' ')),
    error: (...args: any[]) => child.error(args.length === 1 ? args[0] : args.join(' ')),
    debug: (...args: any[]) => child.debug(args.length === 1 ? args[0] : args.join(' ')),
  }
}

// ── Module-specific child loggers ──

export const intelligenceLogger = makeCompat(logger.child({ module: 'intelligence' }))
export const campaignLogger = makeCompat(logger.child({ module: 'campaign' }))
export const emailLogger = makeCompat(logger.child({ module: 'email' }))
export const smsLogger = makeCompat(logger.child({ module: 'sms' }))
export const cronLogger = makeCompat(logger.child({ module: 'cron' }))
export const stripeLogger = makeCompat(logger.child({ module: 'stripe' }))
export const webhookLogger = makeCompat(logger.child({ module: 'webhook' }))
export const aiLogger = makeCompat(logger.child({ module: 'ai' }))
