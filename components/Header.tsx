'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon } from 'lucide-react'

export default function Header() {
  const { data: session } = useSession()

  // Only show header if user is logged in
  if (!session) {
    return null
  }

  return (
    <header className="bg-white shadow-sm border-b fixed top-0 left-0 right-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-end items-center h-16">
          <Link
            href="/profile"
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name || 'Profile'}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <span className="hidden sm:inline">
              {session?.user?.name || 'Profile'}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

