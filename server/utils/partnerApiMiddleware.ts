import { NextRequest, NextResponse } from 'next/server'
import { authenticatePartner, PartnerAuthContext, hasScope } from './partnerAuth'
import { checkIdempotency, storeIdempotency } from './idempotency'
import { prisma } from '@/lib/prisma'

export interface PartnerApiHandler {
  (req: NextRequest, context: PartnerAuthContext): Promise<NextResponse>
}

export interface PartnerApiOptions {
  requiredScope?: string
  requireIdempotency?: boolean
}

/**
 * Middleware wrapper for partner API routes
 * Handles: authentication, rate limiting, idempotency, audit logging
 */
export function withPartnerAuth(
  handler: PartnerApiHandler,
  options: PartnerApiOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now()
    let partnerContext: PartnerAuthContext | null = null
    let idempotencyKey: string | null = null
    let correlationId: string | null = null
    let requestBody: any = null
    let responseStatus = 500
    let responseBody: any = null
    let errorMessage: string | null = null

    try {
      // Get correlation ID from header or generate
      correlationId = req.headers.get('x-correlation-id') || generateCorrelationId()

      // Get idempotency key if required
      if (options.requireIdempotency) {
        idempotencyKey = req.headers.get('idempotency-key') || null
        if (!idempotencyKey) {
          return NextResponse.json(
            {
              errorCode: 'MISSING_IDEMPOTENCY_KEY',
              message: 'Idempotency-Key header is required',
            },
            { status: 400 }
          )
        }

        // Validate UUID format
        if (!isValidUUID(idempotencyKey)) {
          return NextResponse.json(
            {
              errorCode: 'INVALID_IDEMPOTENCY_KEY',
              message: 'Idempotency-Key must be a valid UUID',
            },
            { status: 400 }
          )
        }
      }

      // Authenticate partner
      partnerContext = await authenticatePartner(req)

      // Check scope if required
      if (options.requiredScope && !hasScope(partnerContext, options.requiredScope)) {
        return NextResponse.json(
          {
            errorCode: 'INSUFFICIENT_SCOPE',
            message: `Required scope: ${options.requiredScope}`,
          },
          { status: 403 }
        )
      }

      // Rate limiting (simple in-memory check, can be enhanced with Redis)
      const rateLimitResult = await checkRateLimit(partnerContext.partnerAppId)
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            errorCode: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Limit: ${rateLimitResult.limit} requests per minute`,
          },
          { status: 429 }
        )
      }

      // Parse request body if present
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          const contentType = req.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            requestBody = await req.json()
          }
        } catch (e) {
          // Body might be empty, that's ok
        }
      }

      // Check idempotency if key provided
      if (idempotencyKey && partnerContext) {
        const idempotencyCheck = await checkIdempotency(
          partnerContext.partnerAppId,
          idempotencyKey,
          req.nextUrl.pathname,
          req.method,
          requestBody
        )

        if (idempotencyCheck.cached && idempotencyCheck.response) {
          // Return cached response
          const response = NextResponse.json(idempotencyCheck.response.body, {
            status: idempotencyCheck.response.status,
          })
          response.headers.set('X-Correlation-ID', correlationId)
          response.headers.set('X-Idempotent-Replayed', 'true')
          
          // Log the request
          await logApiRequest({
            partnerId: partnerContext.partnerId,
            partnerAppId: partnerContext.partnerAppId,
            endpoint: req.nextUrl.pathname,
            method: req.method,
            statusCode: idempotencyCheck.response.status,
            duration: Date.now() - startTime,
            idempotencyKey,
            correlationId,
            requestBody,
            responseBody: idempotencyCheck.response.body,
            ipAddress: getClientIp(req),
            userAgent: req.headers.get('user-agent') || null,
          })

          return response
        }
      }

      // Call the actual handler
      const response = await handler(req, partnerContext)

      // Get response body
      try {
        responseBody = await response.clone().json()
      } catch (e) {
        // Response might not be JSON
        responseBody = null
      }

      responseStatus = response.status

      // Store idempotency if key provided
      if (idempotencyKey && partnerContext && responseStatus < 500) {
        await storeIdempotency(
          partnerContext.partnerAppId,
          idempotencyKey,
          req.nextUrl.pathname,
          req.method,
          requestBody,
          responseStatus,
          responseBody
        )
      }

      // Add correlation ID to response
      response.headers.set('X-Correlation-ID', correlationId)

      // Log the request
      await logApiRequest({
        partnerId: partnerContext.partnerId,
        partnerAppId: partnerContext.partnerAppId,
        endpoint: req.nextUrl.pathname,
        method: req.method,
        statusCode: responseStatus,
        duration: Date.now() - startTime,
        idempotencyKey,
        correlationId,
        requestBody,
        responseBody,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get('user-agent') || null,
      })

      return response
    } catch (error: any) {
      errorMessage = error.message || 'Internal server error'
      responseStatus = getErrorStatusCode(error)

      // Create error response
      const errorResponse = {
        errorCode: getErrorCode(error),
        message: errorMessage,
        details: error.details || [],
      }

      responseBody = errorResponse

      // Log the error
      if (partnerContext) {
        await logApiRequest({
          partnerId: partnerContext.partnerId,
          partnerAppId: partnerContext.partnerAppId,
          endpoint: req.nextUrl.pathname,
          method: req.method,
          statusCode: responseStatus,
          duration: Date.now() - startTime,
          idempotencyKey,
          correlationId,
          requestBody,
          responseBody: errorResponse,
          errorMessage,
          ipAddress: getClientIp(req),
          userAgent: req.headers.get('user-agent') || null,
        })
      }

      const response = NextResponse.json(errorResponse, { status: responseStatus })
      if (correlationId) {
        response.headers.set('X-Correlation-ID', correlationId)
      }
      return response
    }
  }
}

/**
 * Simple rate limiting (can be enhanced with Redis)
 */
const rateLimitCache = new Map<string, { count: number; resetAt: number }>()

async function checkRateLimit(partnerAppId: string): Promise<{ allowed: boolean; limit: number }> {
  const partnerApp = await prisma.partnerApp.findUnique({
    where: { id: partnerAppId },
    select: { rateLimitRpm: true },
  })

  if (!partnerApp) {
    return { allowed: false, limit: 0 }
  }

  const limit = partnerApp.rateLimitRpm
  const now = Date.now()
  const key = partnerAppId
  const window = rateLimitCache.get(key)

  if (!window || now > window.resetAt) {
    // New window
    rateLimitCache.set(key, { count: 1, resetAt: now + 60000 }) // 1 minute
    return { allowed: true, limit }
  }

  if (window.count >= limit) {
    return { allowed: false, limit }
  }

  window.count++
  return { allowed: true, limit }
}

/**
 * Log API request
 */
async function logApiRequest(data: {
  partnerId: string | null
  partnerAppId: string | null
  endpoint: string
  method: string
  statusCode: number
  duration: number
  idempotencyKey: string | null
  correlationId: string | null
  requestBody: any
  responseBody: any
  errorMessage?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  try {
    await prisma.apiRequestLog.create({
      data: {
        partnerId: data.partnerId || undefined,
        partnerAppId: data.partnerAppId || undefined,
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        duration: data.duration,
        idempotencyKey: data.idempotencyKey || undefined,
        correlationId: data.correlationId || undefined,
        requestBody: data.requestBody || undefined,
        responseBody: data.responseBody || undefined,
        errorMessage: data.errorMessage || undefined,
        ipAddress: data.ipAddress || undefined,
        userAgent: data.userAgent || undefined,
      },
    })
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log API request:', error)
  }
}

/**
 * Get client IP from request
 */
function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return null
}

/**
 * Generate correlation ID
 */
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Get HTTP status code from error
 */
function getErrorStatusCode(error: any): number {
  if (error.message?.includes('Invalid API key') || error.message?.includes('Invalid API secret')) {
    return 401
  }
  if (error.message?.includes('IP address not allowed')) {
    return 403
  }
  if (error.message?.includes('Rate limit')) {
    return 429
  }
  if (error.message?.includes('not found')) {
    return 404
  }
  if (error.message?.includes('already exists') || error.message?.includes('conflict')) {
    return 409
  }
  if (error.message?.includes('validation') || error.message?.includes('invalid')) {
    return 422
  }
  return 500
}

/**
 * Get error code from error
 */
function getErrorCode(error: any): string {
  if (error.code) {
    return error.code
  }
  if (error.message?.includes('Invalid API key')) {
    return 'INVALID_API_KEY'
  }
  if (error.message?.includes('Invalid API secret')) {
    return 'INVALID_API_SECRET'
  }
  if (error.message?.includes('IP address not allowed')) {
    return 'IP_NOT_ALLOWED'
  }
  if (error.message?.includes('Rate limit')) {
    return 'RATE_LIMIT_EXCEEDED'
  }
  if (error.message?.includes('not found')) {
    return 'NOT_FOUND'
  }
  if (error.message?.includes('already exists') || error.message?.includes('conflict')) {
    return 'CONFLICT'
  }
  if (error.message?.includes('validation') || error.message?.includes('invalid')) {
    return 'VALIDATION_ERROR'
  }
  return 'INTERNAL_ERROR'
}

