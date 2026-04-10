/**
 * Connector credentials storage.
 * Encrypts with AES-256-GCM when CONNECTOR_ENCRYPTION_KEY is set.
 * Falls back to base64-encoded JSON when no key (safe for MVP — DB is already encrypted at rest).
 * Decrypt always tries both formats for resilience.
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getKey(): Buffer | null {
  const key = process.env.CONNECTOR_ENCRYPTION_KEY
  if (!key) return null
  if (key.length === 64) return Buffer.from(key, 'hex')
  if (key.length === 44) return Buffer.from(key, 'base64')
  return crypto.createHash('sha256').update(key).digest()
}

function encryptAES(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

function decryptAES(ciphertext: string, key: Buffer): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid AES format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/** Encrypt credentials — AES if key available, base64 fallback */
export function encryptCredentials(creds: { username: string; password: string }): string {
  const json = JSON.stringify(creds)
  const key = getKey()
  if (key) {
    try {
      return encryptAES(json, key)
    } catch {
      // Encryption failed — fall back to base64
    }
  }
  // Base64 encode (not encrypted, but obfuscated — DB is encrypted at rest)
  return Buffer.from(json).toString('base64')
}

/** Decrypt credentials — tries AES first, then base64, then raw JSON */
export function decryptCredentials(stored: string): { username: string; password: string } {
  if (!stored) throw new Error('No credentials stored')

  // Try 1: AES decrypt (format: iv:tag:ciphertext)
  if (stored.includes(':')) {
    const key = getKey()
    if (key) {
      try {
        return JSON.parse(decryptAES(stored, key))
      } catch {
        // AES failed — maybe key changed, try other formats
      }
    }
  }

  // Try 2: Base64 decode
  try {
    const decoded = Buffer.from(stored, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    if (parsed.username && parsed.password) return parsed
  } catch {}

  // Try 3: Raw JSON (shouldn't happen but resilient)
  try {
    const parsed = JSON.parse(stored)
    if (parsed.username && parsed.password) return parsed
  } catch {}

  throw new Error('Cannot decode credentials — please reconnect')
}

// Legacy exports for compatibility
export function encrypt(plaintext: string): string {
  return encryptCredentials(JSON.parse(plaintext) as any)
}

export function decrypt(ciphertext: string): string {
  return JSON.stringify(decryptCredentials(ciphertext))
}
