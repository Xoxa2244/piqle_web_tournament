import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * Check idempotency key and return cached response if exists
 */
export async function checkIdempotency(
  partnerAppId: string,
  key: string,
  endpoint: string,
  method: string,
  requestBody?: any
): Promise<{ cached: boolean; response?: { status: number; body: any } }> {
  // Clean up expired keys first
  await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })

  // Find existing idempotency key
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      partnerAppId_key: {
        partnerAppId,
        key,
      },
    },
  })

  if (!existing) {
    return { cached: false }
  }

  // If request hash is provided, validate it matches
  if (requestBody && existing.requestHash) {
    const requestHash = hashRequestBody(requestBody)
    if (requestHash !== existing.requestHash) {
      // Same idempotency key but different request body - error
      throw new Error('Idempotency key already used with different request body')
    }
  }

  // Return cached response
  return {
    cached: true,
    response: {
      status: existing.responseStatus,
      body: existing.responseBody,
    },
  }
}

/**
 * Store idempotency key with response
 */
export async function storeIdempotency(
  partnerAppId: string,
  key: string,
  endpoint: string,
  method: string,
  requestBody: any,
  responseStatus: number,
  responseBody: any,
  ttlHours: number = 24
): Promise<void> {
  const requestHash = hashRequestBody(requestBody)
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + ttlHours)

  await prisma.idempotencyKey.upsert({
    where: {
      partnerAppId_key: {
        partnerAppId,
        key,
      },
    },
    create: {
      partnerAppId,
      key,
      endpoint,
      method,
      requestHash,
      responseStatus,
      responseBody,
      expiresAt,
    },
    update: {
      responseStatus,
      responseBody,
      expiresAt,
    },
  })
}

/**
 * Hash request body for validation
 */
function hashRequestBody(body: any): string {
  const json = JSON.stringify(body)
  return crypto.createHash('sha256').update(json).digest('hex')
}

