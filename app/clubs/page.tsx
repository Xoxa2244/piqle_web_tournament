'use client'

import { Suspense, useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MapPin, Search, Plus, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { fromCents } from '@/lib/payment'
import { formatUsDateTimeShort } from '@/lib/dateFormat'
import TournamentModal from '@/components/TournamentModal'
import CreateClubModal from '@/components/CreateClubModal'
import { useBrand } from '@/components/BrandProvider'
import { toast } from '@/components/ui/use-toast'

export const dynamic = 'force-dynamic'

function ClubsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const brand = useBrand()
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'' | 'VENUE' | 'COMMUNITY'>('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [hasBooking, setHasBooking] = useState(false)
  const [hasUpcomingEvents, setHasUpcomingEvents] = useState(false)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [createClubModalOpen, setCreateClubModalOpen] = useState(false)
  const [cancelRequestClubId, setCancelRequestClubId] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateClubModalOpen(true)
  }, [searchParams])

  const listInput = useMemo(() => {
    const trimmed = query.trim()
    return {
      ...(trimmed ? { query: trimmed } : {}),
      ...(kind ? { kind } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(stateCode.trim() ? { state: stateCode.trim() } : {}),
      ...(hasBooking ? { hasBooking: true } : {}),
      ...(hasUpcomingEvents ? { hasUpcomingEvents: true } : {}),
    }
  }, [query, kind, city, stateCode, hasBooking, hasUpcomingEvents])

  const { data: clubs, isLoading } = trpc.club.list.useQuery(listInput)

  const toggleFollow = trpc.club.toggleFollow.useMutation({
    onSuccess: (data) => {
      if (data.status === 'pending') {
        toast({ description: 'Request sent.', variant: 'success' })
      } else if (data.status === 'joined') {
        toast({ description: 'You joined the club.', variant: 'success' })
      } else if (data.status === 'left') {
        toast({ description: 'You left the club.', variant: 'success' })
      }
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation({
    onSuccess: (_, variables) => {
      toast({ description: 'Join request cancelled.', variant: 'success' })
      utils.club.list.invalidate()
      utils.club.get.invalidate({ id: variables.clubId })
      setCancelRequestClubId(null)
    },
    onError: (e) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })
  const utils = trpc.useUtils()

  const onToggleFollow = async (clubId: string) => {
    if (!isLoggedIn) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/clubs')}`)
      return
    }
    await toggleFollow.mutateAsync({ clubId })
    await Promise.all([
      utils.club.list.invalidate(),
      utils.club.get.invalidate({ id: clubId }),
    ])
  }

  const onCancelJoinClick = (clubId: string) => {
    if (!isLoggedIn) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/clubs')}`)
      return
    }
    setCancelRequestClubId(clubId)
  }

  const confirmCancelRequest = () => {
    if (!cancelRequestClubId) return
    cancelJoinRequest.mutate({ clubId: cancelRequestClubId })
  }

  const followingClubs = useMemo(() => {
    if (!isLoggedIn) return []
    return (clubs ?? []).filter((c: any) => c.isFollowing || c.isJoinPending || c.isAdmin)
  }, [clubs, isLoggedIn])

  const discoverClubs = useMemo(() => {
    if (!isLoggedIn) return clubs ?? []
    return (clubs ?? []).filter((c: any) => !c.isFollowing && !c.isJoinPending && !c.isAdmin)
  }, [clubs, isLoggedIn])

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
    return initials || 'CL'
  }

  // IQ brand: auto-redirect if exactly 1 club, or show welcome screen if 0 clubs
  useEffect(() => {
    if (brand.key !== 'iqsport' || !isLoggedIn || isLoading) return
    const myClubs = (clubs ?? []).filter((c: any) => c.isAdmin || c.isFollowing)
    if (myClubs.length === 1) {
      router.replace(`/clubs/${myClubs[0].id}/intelligence`)
    }
  }, [brand.key, isLoggedIn, isLoading, clubs, router])

  // IQ brand welcome screen
  if (brand.key === 'iqsport' && isLoggedIn && !isLoading) {
    const myClubs = (clubs ?? []).filter((c: any) => c.isAdmin || c.isFollowing)

    // 0 clubs — welcome screen
    if (myClubs.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ background: '#0B0D17' }}>
          <div className="w-full max-w-md text-center space-y-8">
            <div>
              <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', boxShadow: '0 8px 30px rgba(139,92,246,0.3)' }}>
                <span className="text-3xl font-black text-white">IQ</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white mb-2">Welcome to IQSport</h1>
              <p className="text-sm text-gray-400">AI-powered intelligence for your racquet sports club</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setCreateClubModalOpen(true)}
                className="w-full flex items-center gap-3 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Create New Club</div>
                  <div className="text-xs text-gray-400">Set up your venue and start getting AI insights</div>
                </div>
              </button>

              <button
                onClick={() => setQuery('')}
                className="w-full flex items-center gap-3 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Join Existing Club</div>
                  <div className="text-xs text-gray-400">Find and request to join a club near you</div>
                </div>
              </button>
            </div>
          </div>

          <CreateClubModal
            isOpen={createClubModalOpen}
            onClose={() => setCreateClubModalOpen(false)}
            onSuccess={(club) => {
              utils.club.list.invalidate()
              router.push(brand.postClubCreateRoute(club.id))
            }}
          />
        </div>
      )
    }

    // 1 club — auto-redirect handled by useEffect above, show loading
    if (myClubs.length === 1) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B0D17' }}>
          <div className="text-gray-400 text-sm">Loading your club...</div>
        </div>
      )
    }

    // 2+ clubs — show IQ-styled list
    return (
      <div className="min-h-screen p-8" style={{ background: '#0B0D17' }}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-white">Your Clubs</h1>
            <p className="text-sm text-gray-400 mt-1">Select a club to view its intelligence dashboard</p>
          </div>

          <div className="space-y-3">
            {myClubs.map((club: any) => (
              <button
                key={club.id}
                onClick={() => router.push(`/clubs/${club.id}/intelligence`)}
                className="w-full flex items-center gap-4 p-5 rounded-2xl text-left transition-all hover:scale-[1.01]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}>
                  <span className="text-sm font-bold text-white">{getInitials(club.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{club.name}</div>
                  <div className="text-xs text-gray-400">
                    {club.city ? `${club.city}${club.state ? `, ${club.state}` : ''}` : 'Location not set'}
                    {club.isAdmin ? ' · Admin' : ''}
                  </div>
                </div>
                <div className="text-gray-500">→</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => setCreateClubModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl text-sm font-medium transition-all"
            style={{ color: '#A78BFA', border: '1px dashed rgba(139,92,246,0.3)' }}
          >
            <Plus className="w-4 h-4" /> Add Another Club
          </button>

          <CreateClubModal
            isOpen={createClubModalOpen}
            onClose={() => setCreateClubModalOpen(false)}
            onSuccess={(club) => {
              utils.club.list.invalidate()
              router.push(brand.postClubCreateRoute(club.id))
            }}
          />
        </div>
      </div>
    )
  }

  const ClubLogo = ({ name, logoUrl }: { name: string; logoUrl?: string | null }) => {
    if (logoUrl) {
      return (
        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
          <Image src={logoUrl} alt="" fill className="object-cover" />
        </div>
      )
    }
    return (
      <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-gray-600">{getInitials(name)}</span>
      </div>
    )
  }

  const renderClubCard = (club: any) => (
    <Card
      key={club.id}
      className="flex h-full flex-col cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => router.push(`/clubs/${club.id}`)}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <ClubLogo name={club.name} logoUrl={club.logoUrl} />
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{club.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="truncate">
                  {club.city || club.state ? `${club.city ?? ''}${club.city && club.state ? ', ' : ''}${club.state ?? ''}` : 'Location not set'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {club.isAdmin ? <Badge className="bg-blue-600 text-white">Admin</Badge> : null}
            {club.isVerified ? <Badge>Verified</Badge> : null}
            {club.hasBooking ? (
              <Badge variant="secondary" className="gap-1">
                Booking <ExternalLink className="h-3 w-3" />
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{club.kind === 'VENUE' ? 'Venue' : 'Community'}</Badge>
          <span className="text-xs text-muted-foreground">
            {club.followersCount} member{club.followersCount === 1 ? '' : 's'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div
          className={`text-sm rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors ${club.nextTournament ? 'cursor-pointer hover:bg-gray-100' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (club.nextTournament) setSelectedTournamentId(club.nextTournament.id)
          }}
        >
          <div className="text-muted-foreground">Next event</div>
          {club.nextTournament ? (
            <div className="mt-1">
              <div className="font-medium text-gray-900 line-clamp-1">
                {club.nextTournament.title}
              </div>
              <div className="text-muted-foreground">
                {formatUsDateTimeShort(club.nextTournament.startDate, { timeZone: club.nextTournament.timezone })} -{' '}
                {formatUsDateTimeShort(club.nextTournament.endDate ?? club.nextTournament.startDate, {
                  timeZone: club.nextTournament.timezone,
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {typeof club.nextTournament.entryFeeCents === 'number' && club.nextTournament.entryFeeCents > 0 ? (
                  <Badge variant="secondary">
                    ${fromCents(club.nextTournament.entryFeeCents).toFixed(2)}
                  </Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">No upcoming events yet.</div>
          )}
        </div>

        {!club.isAdmin && !club.isFollowing && (
          <div className="mt-auto flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant={club.isJoinPending ? 'outline' : 'default'}
              className={`w-full ${club.isJoinPending ? 'border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
              onClick={() => (club.isJoinPending ? onCancelJoinClick(club.id) : onToggleFollow(club.id))}
              disabled={toggleFollow.isPending || cancelJoinRequest.isPending}
              title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
            >
              {club.isJoinPending
                ? 'Cancel request'
                : club.joinPolicy === 'APPROVAL'
                  ? 'Request to the club'
                  : 'Join the club'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clubs</h1>
          <p className="text-sm text-muted-foreground">
            Join clubs to get updates and discover upcoming events.
          </p>
        </div>
        {isLoggedIn ? (
          <Button className="gap-2" onClick={() => setCreateClubModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Create club
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clubs by name"
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3 w-full">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full h-10 pl-3 pr-[calc(12px+1rem)] border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_12px_center]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                }}
              >
                <option value="">All</option>
                <option value="VENUE">Venue club</option>
                <option value="COMMUNITY">Community/coach</option>
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <label className="text-sm font-medium text-gray-700">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Carmel"
                className="h-10 w-full"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[90px]">
              <label className="text-sm font-medium text-gray-700">State</label>
              <Input
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                onBlur={() => setStateCode((v) => v.trim().toUpperCase())}
                placeholder="e.g., IN"
                className="h-10 w-full"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-700 pb-2.5 flex-shrink-0">
              <Checkbox checked={hasBooking} onCheckedChange={(v) => setHasBooking(Boolean(v))} />
              Has booking
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-700 pb-2.5 flex-shrink-0">
              <Checkbox checked={hasUpcomingEvents} onCheckedChange={(v) => setHasUpcomingEvents(Boolean(v))} />
              Has upcoming events
            </label>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading clubs…</div>
      ) : null}

      {!isLoading && (!clubs || clubs.length === 0) ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No clubs found.
          </CardContent>
        </Card>
      ) : null}

      {isLoggedIn && followingClubs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">My clubs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
            {followingClubs.map(renderClubCard)}
          </div>
        </div>
      ) : null}

      {discoverClubs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {isLoggedIn && followingClubs.length > 0 ? 'Discover' : 'All clubs'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
            {discoverClubs.map(renderClubCard)}
          </div>
        </div>
      ) : null}

      <TournamentModal
        tournamentId={selectedTournamentId}
        onClose={() => setSelectedTournamentId(null)}
      />
      <CreateClubModal
        isOpen={createClubModalOpen}
        onClose={() => setCreateClubModalOpen(false)}
        onSuccess={(club) => {
          utils.club.list.invalidate()
          router.push(brand.postClubCreateRoute(club.id))
        }}
      />

      {cancelRequestClubId ? (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setCancelRequestClubId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Cancel request?</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Cancel your join request for this club?
            </p>
            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCancelRequestClubId(null)}
                disabled={cancelJoinRequest.isPending}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={confirmCancelRequest}
                disabled={cancelJoinRequest.isPending}
              >
                {cancelJoinRequest.isPending ? 'Cancelling…' : 'Cancel request'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ClubsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <ClubsPageContent />
    </Suspense>
  )
}
