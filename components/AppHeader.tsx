'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { User as UserIcon, Search, Plus, LogOut, Menu, X, ChevronDown, Bell, MessageCircle } from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { trpc } from '@/lib/trpc'

type RealtimeEvent = { type: 'invalidate'; keys: string[] }
import { formatDescription } from '@/lib/formatDescription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'

export default function AppHeader() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [avatarError, setAvatarError] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [burgerOpen, setBurgerOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const utils = trpc.useUtils()

  const { data: searchResults } = trpc.tournamentAccess.searchTournaments.useQuery(
    { query: searchQuery },
    { enabled: !!session && searchQuery.length >= 2 }
  )

  useEffect(() => {
    if (status !== 'authenticated') return
    const es = new EventSource('/api/realtime')
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent
        if (event.type === 'invalidate' && Array.isArray(event.keys)) {
          event.keys.forEach((key) => {
            if (key === 'notification.list') utils.notification.list.invalidate({ limit: 20 })
            if (key === 'club.listMyChatClubs') utils.club.listMyChatClubs.invalidate()
            if (key === 'tournamentChat.listMyEventChats') utils.tournamentChat.listMyEventChats.invalidate()
          })
        }
      } catch (_) {
        // ignore parse errors
      }
    }
    return () => es.close()
  }, [status, utils])

  const requestAccessMutation = trpc.tournamentAccess.requestAccess.useMutation({
    onSuccess: () => {
      setSearchQuery('')
      setShowSearchDropdown(false)
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    },
  })

  const { data: notificationsData } = trpc.notification.list.useQuery(
    { limit: 20 },
    { enabled: status === 'authenticated', refetchInterval: 5_000 }
  )
  const markClubJoinRequestSeen = trpc.notification.markClubJoinRequestSeen.useMutation({
    onSuccess: () => utils.notification.list.invalidate({ limit: 20 }),
  })
  const markUserNotificationRead = trpc.notification.markUserNotificationRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate({ limit: 20 }),
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearchDropdown(false)
        setSearchExpanded(false)
      }
      if (burgerRef.current && burgerOpen && !burgerRef.current.contains(target)) {
        setBurgerOpen(false)
      }
      if (userMenuRef.current && userMenuOpen && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
      if (notificationsRef.current && notificationsOpen && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [burgerOpen, userMenuOpen, notificationsOpen])

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
  const notifications = notificationsData?.items ?? []
  const unreadCount = notificationsData?.unreadCount ?? 0
  const notificationsBootstrappedRef = useRef(false)
  const shownToastNotificationIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isLoggedIn) {
      notificationsBootstrappedRef.current = false
      shownToastNotificationIdsRef.current = new Set()
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return
    if (!notificationsBootstrappedRef.current) {
      for (const n of notifications) {
        shownToastNotificationIdsRef.current.add(n.id)
      }
      notificationsBootstrappedRef.current = true
      return
    }

    const toastTypes = new Set([
      'CLUB_JOIN_APPROVED',
      'CLUB_JOIN_REJECTED',
      'CLUB_BANNED',
      'CLUB_UNBANNED',
    ])
    for (const n of notifications) {
      if (!toastTypes.has(String(n.type))) continue
      if (n.readAt) continue
      if (shownToastNotificationIdsRef.current.has(n.id)) continue
      shownToastNotificationIdsRef.current.add(n.id)
      toast({
        title: n.title || 'Notification',
        description: n.body || undefined,
      })
    }
  }, [isLoggedIn, notifications])

  const { data: myChatClubs } = trpc.club.listMyChatClubs.useQuery(undefined, {
    enabled: isLoggedIn,
    refetchInterval: 5_000,
  })
  const { data: myEventChats } = trpc.tournamentChat.listMyEventChats.useQuery(undefined, {
    enabled: isLoggedIn,
    refetchInterval: 5_000,
  })

  const unreadChatsCount = useMemo(() => {
    if (!isLoggedIn) return 0
    const clubsUnread = (myChatClubs ?? []).reduce(
      (sum: number, club: any) => sum + (club.unreadCount ?? 0),
      0
    )
    const eventsUnread = (myEventChats ?? []).reduce((sum: number, event: any) => {
      const eventUnread = event.unreadCount ?? 0
      const divisionsUnread = (event.divisions ?? []).reduce(
        (inner: number, division: any) => inner + (division.unreadCount ?? 0),
        0
      )
      return sum + eventUnread + divisionsUnread
    }, 0)
    return clubsUnread + eventsUnread
  }, [isLoggedIn, myChatClubs, myEventChats])

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
              <nav className="hidden lg:flex items-center gap-6">
                <Link
                  href="/clubs"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Clubs
                </Link>
                <Link
                  href="/players"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Players
                </Link>
                <Link
                  href="/admin"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Tournament Management
                </Link>
              </nav>
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

              {/* Search - desktop: icon that expands to input on click */}
              <div ref={searchRef} className="relative hidden lg:flex items-center ml-6">
                <div className="flex items-center overflow-hidden">
                  {searchExpanded ? (
                    <div className="relative flex items-center w-[280px] animate-in fade-in duration-200">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 flex-shrink-0" />
                      <Input
                        type="text"
                        placeholder="Find Tournament"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => searchQuery.length >= 2 && setShowSearchDropdown(true)}
                        className="pl-10 pr-4 flex-1"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchExpanded(true)}
                      className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                      aria-label="Search tournaments"
                    >
                      <Search className="h-5 w-5" />
                    </button>
                  )}
                </div>
                {showSearchDropdown && searchExpanded && (
                  <div className="absolute left-0 right-0 top-full mt-1 ml-0 mr-0 max-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
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

              {/* Notifications (desktop) */}
              {isLoggedIn ? (
                <div ref={notificationsRef} className="hidden lg:block relative ml-4">
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen((o) => !o)}
                    className="relative p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                    aria-label="Notifications"
                    aria-expanded={notificationsOpen}
                    aria-haspopup="true"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                  {notificationsOpen ? (
                    <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50">
                      <div className="px-3 pb-2 mb-1 border-b border-gray-100 flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">Notifications</div>
                      </div>
                      {notifications.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-gray-500">No notifications yet.</div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          {notifications.map((n: any) =>
                            n.type === 'CLUB_JOIN_REQUEST' && n.clubId ? (
                              <button
                                key={n.id}
                                type="button"
                                className="block w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                onClick={async () => {
                                  setNotificationsOpen(false)
                                  await markClubJoinRequestSeen.mutateAsync({ clubId: n.clubId })
                                  router.push(n.targetUrl || '/')
                                }}
                                disabled={markClubJoinRequestSeen.isPending}
                              >
                                <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                                {n.body ? <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</div> : null}
                              </button>
                            ) : (
                              <Link
                                key={n.id}
                                href={n.targetUrl || '/'}
                                className="block px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                onClick={() => {
                                  setNotificationsOpen(false)
                                  if (n.userNotificationId) {
                                    markUserNotificationRead.mutate({ notificationId: n.userNotificationId })
                                  }
                                }}
                              >
                                <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                                {n.body ? <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</div> : null}
                              </Link>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Chats - icon with unread badge (desktop), right of notifications */}
              {isLoggedIn ? (
                <Link
                  href="/chats"
                  className="hidden lg:flex relative p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200 ml-1"
                  aria-label="Chats"
                >
                  <MessageCircle className="h-5 w-5" />
                  {unreadChatsCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                      {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}

              {/* User block: dropdown (desktop) */}
              <div ref={userMenuRef} className="hidden lg:block relative ml-3">
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
                    <Link
                      href="/clubs"
                      className="px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                      onClick={() => setBurgerOpen(false)}
                    >
                      Clubs
                    </Link>
                    <Link
                      href="/chats"
                      className="flex items-center justify-between px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                      onClick={() => setBurgerOpen(false)}
                    >
                      <span>Chats</span>
                      {isLoggedIn && unreadChatsCount > 0 ? (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none">
                          {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
                        </span>
                      ) : null}
                    </Link>
                    <Link
                      href="/players"
                      className="px-4 py-2.5 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                      onClick={() => setBurgerOpen(false)}
                    >
                      Players
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
