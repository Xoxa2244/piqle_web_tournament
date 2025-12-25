import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export interface PartnerAuthContext {
  partnerId: string
  partnerAppId: string
  partnerCode: string
  environment: 'SANDBOX' | 'PRODUCTION'
  scopes: string[]
}

/**
 * Authenticate partner request using Bearer token (Key ID + Secret)
 */
export async function authenticatePartner(
  request: NextRequest
): Promise<PartnerAuthContext> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }

  const token = authHeader.substring(7) // Remove 'Bearer '
  
  // Token format: keyId:secret
  const [keyId, secret] = token.split(':')
  
  if (!keyId || !secret) {
    throw new Error('Invalid token format. Expected: keyId:secret')
  }

  // Find partner app by keyId
  const partnerApp = await prisma.partnerApp.findUnique({
    where: { keyId },
    include: {
      partner: true,
    },
  })

  if (!partnerApp) {
    throw new Error('Invalid API key')
  }

  if (partnerApp.status !== 'ACTIVE') {
    throw new Error('API key is revoked')
  }

  // Verify secret
  const isValidSecret = await bcrypt.compare(secret, partnerApp.secretHash)
  if (!isValidSecret) {
    throw new Error('Invalid API secret')
  }

  // Check IP allowlist if configured
  if (partnerApp.allowedIps.length > 0) {
    const clientIp = getClientIp(request)
    if (!clientIp || !partnerApp.allowedIps.includes(clientIp)) {
      throw new Error('IP address not allowed')
    }
  }

  // Update last used timestamp
  await prisma.partnerApp.update({
    where: { id: partnerApp.id },
    data: { lastUsedAt: new Date() },
  })

  return {
    partnerId: partnerApp.partnerId,
    partnerAppId: partnerApp.id,
    partnerCode: partnerApp.partner.code,
    environment: partnerApp.environment,
    scopes: partnerApp.scopes,
  }
}

/**
 * Check if partner has required scope
 */
export function hasScope(context: PartnerAuthContext, requiredScope: string): boolean {
  return context.scopes.includes(requiredScope)
}

/**
 * Get client IP address from request
 */
function getClientIp(request: NextRequest): string | null {
  // Check various headers for IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return null
}

/**
 * Generate a new API key pair
 */
export async function generateApiKey(): Promise<{ keyId: string; secret: string }> {
  // Generate keyId: prefix + random string
  const keyIdPrefix = 'pk_'
  const randomBytes = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const keyId = keyIdPrefix + randomBytes

  // Generate secret: prefix + random string
  const secretPrefix = 'sk_'
  const secretBytes = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const secret = secretPrefix + secretBytes

  return { keyId, secret }
}

/**
 * Hash API secret
 */
export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

