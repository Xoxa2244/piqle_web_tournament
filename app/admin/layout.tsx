'use client'

import Link from 'next/link'
import { useCallback } from 'react'
import { signOut } from 'next-auth/react'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                Piqle Admin
              </Link>
              <div className="flex space-x-4">
                <Link
                  href="/admin"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Tournaments
                </Link>
                <Link
                  href="/"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Home
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-red-600 hover:text-red-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>
        
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
  )
}
