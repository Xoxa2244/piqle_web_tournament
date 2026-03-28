import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.INTEREST_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret'
const EXPIRY_DAYS = 60

export function generateInterestToken(userId: string, clubId: string): string {
  const payload = Buffer.from(JSON.stringify({
    userId, clubId,
    exp: Math.floor(Date.now() / 1000) + EXPIRY_DAYS * 24 * 60 * 60,
  })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyInterestToken(token: string): { userId: string; clubId: string } | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (data.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: data.userId, clubId: data.clubId }
  } catch {
    return null
  }
}
