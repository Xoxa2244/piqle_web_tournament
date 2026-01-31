'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon, Search, Plus, LogOut } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AppHeader() {
  const { data: session, status } = useSession()
  const [avatarError, setAvatarError] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: searchResults } = trpc.tournamentAccess.searchTournaments.useQuery(
    { query: searchQuery },
    { enabled: !!session && searchQuery.length >= 2 }
  )

  const requestAccessMutation = trpc.tournamentAccess.requestAccess.useMutation({
    onSuccess: () => {
      setSearchQuery('')
      setShowSearchDropdown(false)
    },
    onError: (error) => {
      alert(`Error: ${error.message}`)
    },
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setShowSearchDropdown(searchQuery.length >= 2)
  }, [searchQuery])

  const handleLogout = async () => {
    setShowLogoutModal(false)
    await signOut({ callbackUrl: '/auth/signin' })
  }

  const hasValidAvatar = Boolean(
    session?.user?.image &&
      session.user.image.trim() !== '' &&
      (session.user.image.startsWith('http') || session.user.image.startsWith('data:'))
  )
  const avatarSrc = session?.user?.image || ''

  const isLoggedIn = status === 'authenticated'

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {/* Part 1 - Left: Logo + Nav links, fixed spacing */}
            <div className="flex items-center gap-6 flex-shrink-0">
              <Link href="/" className="flex items-center">
                {!logoError ? (
                  <img
                    src="/Logo.svg"
                    alt="Piqle"
                    className="h-8 w-auto object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-2xl font-bold text-lime-600">PIQLE</span>
                )}
              </Link>
              <nav className="flex items-center gap-6">
                <Link
                  href="/"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Home
                </Link>
                <Link
                  href="/admin"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Tournaments
                </Link>
              </nav>
            </div>

            {/* Spacer - auto, takes all remaining width */}
            <div className="flex-1 min-w-0" aria-hidden />

            {/* Part 2 - Right: Create, Search, Username, Logout - fixed spacing (24px, 44px, 44px) */}
            <div className="flex items-center flex-shrink-0">
              <Link href={isLoggedIn ? '/admin/new' : '/auth/signin'}>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Tournament
                </Button>
              </Link>

              {/* Search - 300px, 24px from Create, 44px from Username */}
              <div ref={searchRef} className="relative w-[300px] hidden md:block ml-6 mr-[44px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Find Tournament"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
                  className="pl-10 pr-4"
                />
              </div>
              {showSearchDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
                  {!isLoggedIn ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      Sign in to search tournaments
                    </div>
                  ) : !searchResults ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">No tournaments found</div>
                  ) : (
                    <div className="py-2">
                      {searchResults.map((tournament: any) => (
                        <div
                          key={tournament.id}
                          className="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-900 truncate">{tournament.title}</h3>
                              {tournament.description && (
                                <div
                                  className="text-xs text-gray-600 line-clamp-2 mt-0.5"
                                  dangerouslySetInnerHTML={{
                                    __html: formatDescription(tournament.description),
                                  }}
                                />
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                requestAccessMutation.mutate({ tournamentId: tournament.id })
                              }}
                              disabled={requestAccessMutation.isPending}
                              className="flex-shrink-0"
                            >
                              {requestAccessMutation.isPending ? 'Requesting...' : 'Request Access'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

              {/* User Profile & Logout - 44px between username and logout */}
              <div className="flex items-center gap-[44px]">
              {isLoggedIn ? (
                <>
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md transition-colors"
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
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center border border-gray-300">
                        <UserIcon className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                    <span className="text-sm font-medium whitespace-nowrap truncate max-w-[120px] sm:max-w-[180px]">
                      {session?.user?.name || 'Username'}
                    </span>
                  </Link>
                  <button
                    onClick={() => setShowLogoutModal(true)}
                    className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    title="Logout"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <Link
                  href="/auth/signin"
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center border border-gray-300">
                    <UserIcon className="h-4 w-4 text-gray-500" />
                  </div>
                  <span className="text-sm font-medium">Sign In</span>
                </Link>
              )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Logout</h3>
            <p className="text-gray-600 text-sm mb-6">Are you sure you want to sign out?</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
