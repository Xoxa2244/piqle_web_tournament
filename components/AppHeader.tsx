'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon, Search, Plus, LogOut, Menu, X, ChevronDown, Settings } from 'lucide-react'
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
  const [burgerOpen, setBurgerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

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
      const target = event.target as Node
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearchDropdown(false)
      }
      if (burgerRef.current && burgerOpen && !burgerRef.current.contains(target)) {
        setBurgerOpen(false)
      }
      if (userMenuRef.current && userMenuOpen && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [burgerOpen, userMenuOpen])

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
      <header className="fixed top-0 left-0 right-0 z-[100] w-full bg-white border-b border-gray-200 shadow-sm">
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
            </div>

            {/* Spacer - auto, takes all remaining width */}
            <div className="flex-1 min-w-0" aria-hidden />

            {/* Part 2 - Right: Create, Search, Username, Logout (desktop) / Burger (mobile) */}
            <div className="flex items-center flex-shrink-0 gap-2 lg:gap-0">
              <Link href={isLoggedIn ? '/admin/new' : '/auth/signin'}>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Tournament
                </Button>
              </Link>

              {/* Search - desktop only */}
              <div ref={searchRef} className="relative w-[300px] hidden lg:block ml-6 mr-[44px]">
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

              {/* User block: dropdown (desktop) */}
              <div ref={userMenuRef} className="hidden lg:block relative ml-6">
                {isLoggedIn ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setUserMenuOpen((o) => !o)}
                      className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2 py-1.5 rounded-md transition-colors border border-transparent hover:border-gray-200"
                      aria-expanded={userMenuOpen}
                      aria-haspopup="true"
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
                      <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                        <Link
                          href="/profile"
                          className="flex items-center gap-2 px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <UserIcon className="h-4 w-4 text-gray-500" />
                          My Profile
                        </Link>
                        <Link
                          href="/admin"
                          className="flex items-center gap-2 px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <Settings className="h-4 w-4 text-gray-500" />
                          Tournament Management
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false)
                            setShowLogoutModal(true)
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 text-left w-full text-gray-700 hover:bg-gray-50 text-sm font-medium"
                        >
                          <LogOut className="h-4 w-4 text-gray-500" />
                          Logout
                        </button>
                      </div>
                    )}
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

              {/* Burger button - mobile/tablet only */}
              <div ref={burgerRef} className="relative lg:hidden ml-2">
                <button
                  type="button"
                  onClick={() => setBurgerOpen((o) => !o)}
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  aria-label={burgerOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={burgerOpen}
                >
                  {burgerOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>

                {/* Burger dropdown panel */}
                {burgerOpen && (
                  <div className="absolute right-0 top-full mt-1 w-[min(320px,100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-xl py-3 z-50 flex flex-col gap-1">
                    {/* Search in burger */}
                    <div className="px-3 pb-3 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Find Tournament"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
                          className="pl-10 pr-4 w-full"
                        />
                      </div>
                      {showSearchDropdown && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                          {!isLoggedIn ? (
                            <div className="p-3 text-center text-gray-500 text-sm">Sign in to search</div>
                          ) : !searchResults ? (
                            <div className="p-3 text-center text-gray-500 text-sm">Searching...</div>
                          ) : searchResults.length === 0 ? (
                            <div className="p-3 text-center text-gray-500 text-sm">No tournaments found</div>
                          ) : (
                            <div className="py-2">
                              {searchResults.map((tournament: any) => (
                                <div
                                  key={tournament.id}
                                  className="px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h3 className="font-medium text-gray-900 text-sm truncate">{tournament.title}</h3>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        requestAccessMutation.mutate({ tournamentId: tournament.id })
                                        setBurgerOpen(false)
                                      }}
                                      disabled={requestAccessMutation.isPending}
                                      className="flex-shrink-0 text-xs"
                                    >
                                      {requestAccessMutation.isPending ? '…' : 'Request'}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Link
                      href="/admin"
                      className="px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                      onClick={() => setBurgerOpen(false)}
                    >
                      Tournament Management
                    </Link>
                    {isLoggedIn ? (
                      <>
                        <Link
                          href="/profile"
                          className="flex items-center gap-2 px-4 py-2.5 text-gray-700 hover:bg-gray-50"
                          onClick={() => setBurgerOpen(false)}
                        >
                          {hasValidAvatar && !avatarError && avatarSrc ? (
                            <Image
                              src={avatarSrc}
                              alt=""
                              width={24}
                              height={24}
                              className="rounded-full object-cover"
                              onError={() => setAvatarError(true)}
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                              <UserIcon className="h-3 w-3 text-gray-500" />
                            </div>
                          )}
                          <span className="text-sm font-medium truncate">{session?.user?.name || 'Username'}</span>
                        </Link>
                        <button
                          onClick={() => {
                            setBurgerOpen(false)
                            setShowLogoutModal(true)
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-50 w-full text-sm font-medium"
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </button>
                      </>
                    ) : (
                      <Link
                        href="/auth/signin"
                        className="flex items-center gap-2 px-4 py-2.5 text-gray-700 hover:bg-gray-50"
                        onClick={() => setBurgerOpen(false)}
                      >
                        <UserIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Sign In</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
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
