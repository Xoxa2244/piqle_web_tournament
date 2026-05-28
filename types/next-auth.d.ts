import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub: string
    // Display fields snapshot from the User object at sign-in. Read by
    // the session callback so it doesn't need to hit the DB on every
    // request. See lib/auth.ts callbacks.jwt / callbacks.session.
    name?: string | null
    email?: string | null
    picture?: string | null
  }
}

