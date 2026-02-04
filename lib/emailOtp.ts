import crypto from 'crypto'

export const EMAIL_OTP_LENGTH = 6
export const EMAIL_OTP_MAX_ATTEMPTS = 5
export const EMAIL_OTP_COOLDOWN_MS = 60 * 1000

export function getOtpTtlMinutes() {
  const raw = Number(process.env.EMAIL_OTP_TTL_MINUTES || 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 10
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function generateOtpCode() {
  const code = crypto.randomInt(0, 10 ** EMAIL_OTP_LENGTH)
  return String(code).padStart(EMAIL_OTP_LENGTH, '0')
}

export function hashOtp(email: string, code: string) {
  const secret =
    process.env.EMAIL_OTP_SECRET || process.env.NEXTAUTH_SECRET || ''

  if (!secret) {
    throw new Error('EMAIL_OTP_SECRET is not set')
  }

  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}:${code}:${secret}`)
    .digest('hex')
}
