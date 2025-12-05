'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon, LayoutDashboard, Trophy } from 'lucide-react'
import { useState } from 'react'

export default function Header() {
  const { data: session } = useSession()
  const [avatarError, setAvatarError] = useState(false)

  // Only show header if user is logged in
  if (!session) {
    return null
  }

  const hasValidAvatar = Boolean(session?.user?.image && 
    session.user.image.trim() !== '' &&
    (session.user.image.startsWith('http') || session.user.image.startsWith('data:')))
  
  const avatarSrc = session?.user?.image || ''
  const isTD = session.user.role === 'TD'

  return (
    <header className="bg-white shadow-sm border-b fixed top-0 left-0 right-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-blue-600">Piqle</span>
          </Link>

          {/* Navigation */}
          <div className="flex items-center space-x-1">
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
            <Link
              href="/profile"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {hasValidAvatar && !avatarError && avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt={session?.user?.name || 'Profile'}
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
          </div>
        </div>
      </div>
    </header>
  )
}

