import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./prisma"
import { hashOtp, normalizeEmail } from "./emailOtp"
import { sendEmail } from "./sendTransactionEmail"
import bcrypt from 'bcryptjs'

async function linkPlayersToUserByEmail(userId: string, email?: string | null) {
  if (!email) return
  const normalized = normalizeEmail(email)
  const players = await prisma.player.findMany({
    where: {
      userId: null,
      email: { equals: normalized, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (!players.length) return
  await prisma.player.updateMany({
    where: { id: { in: players.map((p) => p.id) } },
    data: { userId },
  })
}

// Ensure NEXTAUTH_SECRET is set
if (!process.env.NEXTAUTH_SECRET) {
  console.error('ERROR: NEXTAUTH_SECRET is not set in environment variables!')
}

const getAppBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!env) return 'http://localhost:3000'
  return env.startsWith('http') ? env.replace(/\/$/, '') : `https://${env}`
}

const buildMagicLinkEmailHtml = (url: string) => {
  const baseUrl = getAppBaseUrl()
  const logoUrl = `${baseUrl}/Logo.png`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Piqle</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="Logo" width="120" height="40" style="display: block; max-width: 120px; height: auto;" />
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 28px 24px 20px; text-align: center;">
                    <p style="margin: 0 0 12px; font-size: 15px; color: #6b7280;">Use the button below to sign in</p>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827;">Sign in to Piqle</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 24px 24px; text-align: center;">
                    <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #22c55e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Sign in</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 24px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                      If you did not request this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  debug: true,
  useSecureCookies: process.env.NODE_ENV === 'production',
  logger: {
    error(code, metadata) {
      console.error('[NextAuth Error]', code, metadata)
    },
    warn(code) {
      console.warn('[NextAuth Warn]', code)
    },
    debug(code, metadata) {
      console.log('[NextAuth Debug]', code, metadata)
    },
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // Allow linking Google account to an existing user with the same verified email.
      allowDangerousEmailAccountLinking: true,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.EMAIL_SERVER_PORT || process.env.SMTP_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER || process.env.SMTP_USER || '',
          pass: process.env.EMAIL_SERVER_PASSWORD || process.env.SMTP_PASS || '',
        },
      },
      from: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@piqle.io',
      async sendVerificationRequest({ identifier, url }) {
        const html = buildMagicLinkEmailHtml(url)
        const text = `Sign in to Piqle: ${url}

If you did not request this email, you can safely ignore it.`

        await sendEmail({
          to: identifier,
          subject: 'Sign in to Piqle',
          html,
          text,
        })
      },
    }),
    CredentialsProvider({
      id: 'email-otp',
      name: 'Email OTP',
      credentials: {
        email: { label: 'Email', type: 'text' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email || '')
        const code = `${credentials?.code || ''}`.trim()

        if (!email || !code) {
          throw new Error('EMAIL_CODE_INVALID')
        }

        const otp = await prisma.emailOtp.findUnique({ where: { email } })
        if (!otp) {
          throw new Error('EMAIL_CODE_INVALID')
        }

        if (otp.expiresAt.getTime() < Date.now()) {
          await prisma.emailOtp.delete({ where: { email } })
          throw new Error('EMAIL_CODE_EXPIRED')
        }

        if (otp.attemptsLeft <= 0) {
          throw new Error('EMAIL_CODE_ATTEMPTS_EXCEEDED')
        }

        const expectedHash = hashOtp(email, code)
        if (expectedHash !== otp.codeHash) {
          await prisma.emailOtp.update({
            where: { email },
            data: { attemptsLeft: Math.max(otp.attemptsLeft - 1, 0) },
          })
          throw new Error('EMAIL_CODE_INVALID')
        }

        await prisma.emailOtp.delete({ where: { email } })

        const existingUser = await prisma.user.findUnique({
          where: { email },
          include: { accounts: true },
        })

        if (existingUser?.accounts?.some((account) => account.provider === 'google')) {
          throw new Error('EMAIL_GOOGLE_ACCOUNT')
        }

        const user =
          existingUser ??
          (await prisma.user.create({
            data: {
              email,
              emailVerified: new Date(),
            },
          }))

        if (!user.emailVerified) {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          })
        }

        return user
      },
    }),
    CredentialsProvider({
      id: 'email-password',
      name: 'Email Password',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email || '')
        const password = `${credentials?.password || ''}`.trim()

        if (!email || !password) {
          throw new Error('EMAIL_PASSWORD_INVALID')
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { accounts: true },
        })

        if (!user) {
          throw new Error('EMAIL_PASSWORD_INVALID')
        }

        if (user.accounts?.some((account) => account.provider === 'google')) {
          throw new Error('EMAIL_GOOGLE_ACCOUNT')
        }

        if (!user.passwordHash) {
          throw new Error('EMAIL_PASSWORD_NOT_SET')
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          throw new Error('EMAIL_PASSWORD_INVALID')
        }

        if (!user.emailVerified) {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          })
        }

        return user
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
      }
      return token
    },
    async signIn({ user }) {
      if (user?.id) {
        await linkPlayersToUserByEmail(String(user.id), user.email ?? null)
      }
      return true
    },
    async redirect({ url, baseUrl }) {
      // After successful sign in, redirect properly
      // If callbackUrl is provided and is relative, use it
      if (url && url.startsWith('/')) {
        return `${baseUrl}${url}`
      }
      // If callbackUrl is absolute and same origin, use it
      if (url && url.startsWith(baseUrl)) {
        return url
      }
      // Default to home page
      return `${baseUrl}/`
    },
    async session({ session, user, token }) {
      const userId = session?.user?.id || user?.id || token?.sub
      if (session?.user && userId) {
        session.user.id = String(userId)
        // Always load name/image/email from DB so profile updates show in header
        const dbUser = await prisma.user.findUnique({
          where: { id: String(userId) },
          select: { name: true, image: true, email: true },
        })
        if (dbUser) {
          session.user.name = dbUser.name ?? session.user.name ?? null
          session.user.image = dbUser.image ?? session.user.image ?? null
          session.user.email = dbUser.email ?? session.user.email ?? null
        }
      }
      return session
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

