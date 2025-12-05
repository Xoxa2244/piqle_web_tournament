'use client'

import Link from 'next/link'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { User, LogOut, LayoutDashboard, Trophy } from 'lucide-react'

export default function PublicHeader() {
  const { data: session, status } = useSession()
  const isTD = session?.user?.role === 'TD'

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <Link href="/" className="flex items-center">
            <h1 className="text-xl font-bold text-blue-600">Piqle</h1>
          </Link>

          {/* Right side - Navigation & Auth */}
          <div className="flex items-center space-x-1">
            {status === 'loading' ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : session ? (
              <>
                {/* TD Navigation */}
                {isTD && (
                  <>
                    <Link
                      href="/dashboard"
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span className="hidden sm:inline">Dashboard</span>
                    </Link>
                    <Link
                      href="/admin"
                      className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      <Trophy className="h-4 w-4" />
                      <span className="hidden sm:inline">Tournaments</span>
                    </Link>
                  </>
                )}

                {/* Profile */}
                <Link
                  href="/profile"
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{session.user?.name || session.user?.email}</span>
                </Link>

                {/* Sign Out */}
                <button
                  onClick={() => signOut()}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
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

