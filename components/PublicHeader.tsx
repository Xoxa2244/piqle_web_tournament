'use client'

import Link from 'next/link'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { User, LogOut, LayoutDashboard } from 'lucide-react'

export default function PublicHeader() {
  const { data: session, status } = useSession()

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Piqle Tournament</h1>
          </Link>

          {/* Right side - Auth buttons */}
          <div className="flex items-center space-x-3">
            {status === 'loading' ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : session ? (
              <>
                {/* Tournament Director Console */}
                <Link href="/admin">
                  <Button variant="outline" size="sm" className="flex items-center space-x-2">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">TD Console</span>
                  </Button>
                </Link>

                {/* Profile */}
                <Link href="/profile">
                  <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{session.user?.name || session.user?.email}</span>
                  </Button>
                </Link>

                {/* Sign Out */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut()}
                  className="flex items-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signIn()}
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  onClick={() => signIn()}
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

