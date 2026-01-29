import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./prisma"
import { hashOtp, normalizeEmail } from "./emailOtp"
import bcrypt from 'bcryptjs'

// Ensure NEXTAUTH_SECRET is set
if (!process.env.NEXTAUTH_SECRET) {
  console.error('ERROR: NEXTAUTH_SECRET is not set in environment variables!')
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
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || process.env.SMTP_HOST,
        port: parseInt(process.env.EMAIL_SERVER_PORT || process.env.SMTP_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER || process.env.SMTP_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD || process.env.SMTP_PASS,
        },
      },
      from: process.env.EMAIL_FROM || process.env.SMTP_FROM,
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
    async signIn({ user, account, profile }) {
      // Allow all sign-ins - PrismaAdapter will handle user creation
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
      // Default to /admin
      return `${baseUrl}/admin`
    },
    async session({ session, user }) {
      if (session?.user && user?.id) {
        session.user.id = user.id
      }
      return session
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

