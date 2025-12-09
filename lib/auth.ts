import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./prisma"

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
        host: process.env.EMAIL_SERVER_HOST,
        port: parseInt(process.env.EMAIL_SERVER_PORT || "587"),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
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
      // Default to public tournaments list (players first)
      return `${baseUrl}/scoreboard`
    },
    async session({ session, user }) {
      if (session?.user && user?.id) {
        session.user.id = user.id
        // Add role to session for client-side access
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, gender: true },
        })
        if (dbUser) {
          session.user.role = dbUser.role
          session.user.gender = dbUser.gender ?? null
        }
      }
      return session
    },
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

