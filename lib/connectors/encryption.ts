/**
 * AES-256-GCM encryption for connector credentials.
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.CONNECTOR_ENCRYPTION_KEY
  if (!key) throw new Error('CONNECTOR_ENCRYPTION_KEY is not set')
  // Accept 32-byte hex or base64 key
  if (key.length === 64) return Buffer.from(key, 'hex')
  if (key.length === 44) return Buffer.from(key, 'base64')
  return crypto.createHash('sha256').update(key).digest()
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/** Encrypt credentials object */
export function encryptCredentials(creds: { username: string; password: string }): string {
  return encrypt(JSON.stringify(creds))
}

/** Decrypt credentials object */
export function decryptCredentials(encrypted: string): { username: string; password: string } {
  return JSON.parse(decrypt(encrypted))
}
