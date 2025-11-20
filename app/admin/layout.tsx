'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon } from 'lucide-react'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session } = useSession()
  const [avatarError, setAvatarError] = useState(false)
  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }, [])

  const hasValidAvatar = Boolean(session?.user?.image && 
    session.user.image.trim() !== '' &&
    (session.user.image.startsWith('http') || session.user.image.startsWith('data:')))
  
  const avatarSrc = session?.user?.image || ''

  return (
    <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                Piqle Admin
              </Link>
              <div className="flex items-center space-x-4">
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
                {/* Profile Link */}
                <Link
                  href="/profile"
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {hasValidAvatar && !avatarError && avatarSrc ? (
                    <Image
                      src={avatarSrc}
                      alt={session.user.name || 'Profile'}
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
                  <span className="hidden sm:inline">
                    {session?.user?.name || 'Profile'}
                  </span>
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
