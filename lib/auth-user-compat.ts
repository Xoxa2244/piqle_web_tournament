import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/emailOtp'

export type CompatAuthUser = {
  id: string
  email: string
  name: string | null
  image: string | null
  emailVerified: Date | null
  passwordHash?: string | null
}

async function takeFirst<T>(query: Promise<T[]>) {
  const rows = await query
  return rows[0] ?? null
}

export async function getCompatUserByEmail(email: string) {
  const normalized = normalizeEmail(email)
  return takeFirst(
    prisma.$queryRaw<Array<CompatAuthUser>>`
      SELECT
        id,
        email,
        name,
        image,
        "emailVerified",
        password_hash AS "passwordHash"
      FROM users
      WHERE LOWER(email) = LOWER(${normalized})
      LIMIT 1
    `
  )
}

export async function getCompatUserById(id: string) {
  return takeFirst(
    prisma.$queryRaw<Array<CompatAuthUser>>`
      SELECT
        id,
        email,
        name,
        image,
        "emailVerified",
        password_hash AS "passwordHash"
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `
  )
}

export async function getCompatUserAccountProviders(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  })
  return accounts.map((account) => account.provider)
}

export async function createCompatUser(input: {
  email: string
  name?: string | null
  image?: string | null
  emailVerified?: Date | null
  passwordHash?: string | null
  smsOptIn?: boolean
}) {
  const id = randomUUID()
  const normalized = normalizeEmail(input.email)

  await prisma.$executeRaw`
    INSERT INTO users (
      id,
      email,
      name,
      image,
      "emailVerified",
      password_hash,
      role,
      "isActive",
      sms_opt_in,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${normalized},
      ${input.name ?? null},
      ${input.image ?? null},
      ${input.emailVerified ?? null},
      ${input.passwordHash ?? null},
      'TD',
      true,
      ${input.smsOptIn ?? false},
      NOW(),
      NOW()
    )
  `

  return getCompatUserById(id)
}

export async function updateCompatUserAuthFields(
  userId: string,
  input: {
    name?: string | null
    image?: string | null
    email?: string
    emailVerified?: Date | null
    passwordHash?: string | null
    smsOptIn?: boolean
  }
) {
  await prisma.$executeRaw`
    UPDATE users
    SET
      email = COALESCE(${input.email ? normalizeEmail(input.email) : null}, email),
      name = COALESCE(${typeof input.name !== 'undefined' ? input.name : null}, name),
      image = COALESCE(${typeof input.image !== 'undefined' ? input.image : null}, image),
      "emailVerified" = COALESCE(${typeof input.emailVerified !== 'undefined' ? input.emailVerified : null}, "emailVerified"),
      password_hash = COALESCE(${typeof input.passwordHash !== 'undefined' ? input.passwordHash : null}, password_hash),
      sms_opt_in = CASE
        WHEN ${input.smsOptIn === true} THEN true
        ELSE sms_opt_in
      END,
      "updatedAt" = NOW()
    WHERE id = ${userId}
  `

  return getCompatUserById(userId)
}
