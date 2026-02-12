'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MapPin, Search, Plus, ExternalLink, X, Calendar, Users, Trophy } from 'lucide-react'
import Image from 'next/image'
import { fromCents } from '@/lib/payment'
import { formatDescription } from '@/lib/formatDescription'

export const dynamic = 'force-dynamic'

function getTournamentStatus(tournament: { startDate: Date | string; endDate: Date | string }): 'past' | 'upcoming' | 'in_progress' {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = new Date(tournament.endDate)
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}

function getTournamentStatusLabel(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'Past'
    case 'upcoming': return 'Upcoming'
    case 'in_progress': return 'In progress'
  }
}

function getTournamentStatusBadgeClass(status: 'past' | 'upcoming' | 'in_progress') {
  switch (status) {
    case 'past': return 'bg-gray-100 text-gray-700'
    case 'upcoming': return 'bg-blue-50 text-blue-700'
    case 'in_progress': return 'bg-green-50 text-green-700'
  }
}

export default function ClubsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'' | 'VENUE' | 'COMMUNITY'>('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [hasBooking, setHasBooking] = useState(false)
  const [hasUpcomingEvents, setHasUpcomingEvents] = useState(false)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const listInput = useMemo(() => {
    const trimmed = query.trim()
    return {
      ...(trimmed ? { query: trimmed } : {}),
      ...(kind ? { kind } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(stateCode.trim() ? { state: stateCode.trim() } : {}),
      ...(verifiedOnly ? { verifiedOnly: true } : {}),
      ...(hasBooking ? { hasBooking: true } : {}),
      ...(hasUpcomingEvents ? { hasUpcomingEvents: true } : {}),
    }
  }, [query, kind, city, stateCode, verifiedOnly, hasBooking, hasUpcomingEvents])

  const { data: clubs, isLoading } = trpc.club.list.useQuery(listInput)
  const { data: modalTournament } = trpc.public.getBoardById.useQuery(
    { id: selectedTournamentId! },
    { enabled: !!selectedTournamentId }
  )

  const toggleFollow = trpc.club.toggleFollow.useMutation()
  const cancelJoinRequest = trpc.club.cancelJoinRequest.useMutation()
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

  const onCancelJoin = async (clubId: string) => {
    if (!isLoggedIn) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/clubs')}`)
      return
    }
    if (!confirm('Cancel your join request?')) return
    await cancelJoinRequest.mutateAsync({ clubId })
    await Promise.all([utils.club.list.invalidate(), utils.club.get.invalidate({ id: clubId })])
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
    <Card key={club.id} className="flex flex-col">
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
      <CardContent className="flex-1 space-y-4">
        <div className="text-sm rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-muted-foreground">Next event</div>
          {club.nextTournament ? (
            <div className="mt-1">
              <div className="font-medium text-gray-900 line-clamp-1">
                {club.nextTournament.title}
              </div>
              <div className="text-muted-foreground">
                {new Date(club.nextTournament.startDate).toLocaleString()}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {typeof club.nextTournament.entryFeeCents === 'number' && club.nextTournament.entryFeeCents > 0 ? (
                  <Badge variant="secondary">
                    ${fromCents(club.nextTournament.entryFeeCents).toFixed(2)}
                  </Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  onClick={() => {
                  setDescriptionExpanded(false)
                  setSelectedTournamentId(club.nextTournament!.id)
                }}
                >
                  View
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">No upcoming events yet.</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/clubs/${club.id}`} className="flex-1">
            <Button variant="outline" className="w-full">
              View
            </Button>
          </Link>
          {club.isAdmin ? (
            <Button variant="secondary" className="flex-1" disabled>
              Admin
            </Button>
          ) : (
            <Button
              variant={club.isJoinPending ? 'outline' : club.isFollowing ? 'secondary' : 'default'}
              className={`flex-1 ${!club.isFollowing && !club.isJoinPending ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              onClick={() => (club.isJoinPending ? onCancelJoin(club.id) : onToggleFollow(club.id))}
              disabled={toggleFollow.isPending || cancelJoinRequest.isPending}
              title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
            >
              {club.isFollowing
                ? 'Joined'
                : club.isJoinPending
                  ? 'Cancel'
                  : club.joinPolicy === 'APPROVAL'
                    ? 'Request to the club'
                    : 'Join the club'}
            </Button>
          )}
        </div>
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
          <Link href="/clubs/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create club
            </Button>
          </Link>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Carmel"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">State</label>
              <Input
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                onBlur={() => setStateCode((v) => v.trim().toUpperCase())}
                placeholder="e.g., IN"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={verifiedOnly} onCheckedChange={(v) => setVerifiedOnly(Boolean(v))} />
              Verified only
            </label>
            <span className="text-xs text-muted-foreground">
              Verified = approved by Piqle team.
            </span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={hasBooking} onCheckedChange={(v) => setHasBooking(Boolean(v))} />
              Has booking
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={hasUpcomingEvents} onCheckedChange={(v) => setHasUpcomingEvents(Boolean(v))} />
              Has upcoming events
            </label>

            {query.trim() || kind || city.trim() || stateCode.trim() || verifiedOnly || hasBooking || hasUpcomingEvents ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setQuery('')
                  setKind('')
                  setCity('')
                  setStateCode('')
                  setVerifiedOnly(false)
                  setHasBooking(false)
                  setHasUpcomingEvents(false)
                }}
              >
                Clear
              </Button>
            ) : null}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {followingClubs.map(renderClubCard)}
          </div>
        </div>
      ) : null}

      {discoverClubs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {isLoggedIn && followingClubs.length > 0 ? 'Discover' : 'All clubs'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {discoverClubs.map(renderClubCard)}
          </div>
        </div>
      ) : null}

      {/* Tournament modal (same as main page) */}
      {selectedTournamentId && modalTournament && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTournamentId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {modalTournament.image ? (
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={modalTournament.image}
                      alt={modalTournament.title}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{modalTournament.title}</h2>
                  <p className="text-gray-600 mt-1">Tournament Details</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/tournaments/${modalTournament.id}/register`}>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Join Tournament
                  </Button>
                </Link>
                <button
                  onClick={() => setSelectedTournamentId(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(modalTournament))}`}
                  >
                    {getTournamentStatusLabel(getTournamentStatus(modalTournament))}
                  </span>
                </div>
                {modalTournament.description && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                    <div
                      className={`text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none ${!descriptionExpanded ? 'line-clamp-3' : ''}`}
                      dangerouslySetInnerHTML={{ __html: formatDescription(modalTournament.description) }}
                    />
                    {(modalTournament.description.split('\n').length > 3 || modalTournament.description.length > 150) && (
                      <button
                        onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                        className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        {descriptionExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>
                        {new Date(modalTournament.startDate).toLocaleDateString()} – {new Date(modalTournament.endDate).toLocaleDateString()}
                      </span>
                    </div>
                    {(modalTournament.registrationStartDate || modalTournament.registrationEndDate) && (
                      <div className="flex items-center text-sm text-gray-600">
                        <span>
                          Registration: {modalTournament.registrationStartDate
                            ? new Date(modalTournament.registrationStartDate).toLocaleDateString()
                            : '—'}
                          {' – '}
                          {modalTournament.registrationEndDate
                            ? new Date(modalTournament.registrationEndDate).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                    )}
                    {modalTournament.venueName && (
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>{modalTournament.venueName}</span>
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2" />
                      <span>{modalTournament.divisions?.length ?? 0} division{(modalTournament.divisions?.length ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                    {modalTournament.entryFee != null && Number(modalTournament.entryFee) > 0 && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Trophy className="h-4 w-4 mr-2" />
                        <span>Entry Fee: ${Number(modalTournament.entryFee).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                {modalTournament.divisions && modalTournament.divisions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Divisions</h3>
                    <div className="flex flex-wrap gap-2">
                      {modalTournament.divisions.map((d: { id: string; name: string }) => (
                        <Badge key={d.id} variant="secondary">
                          {d.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
