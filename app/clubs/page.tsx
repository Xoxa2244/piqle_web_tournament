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
import { MapPin, Search, Plus, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { fromCents } from '@/lib/payment'

export const dynamic = 'force-dynamic'

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
    return (clubs ?? []).filter((c: any) => c.isFollowing || c.isJoinPending)
  }, [clubs, isLoggedIn])

  const discoverClubs = useMemo(() => {
    if (!isLoggedIn) return clubs ?? []
    return (clubs ?? []).filter((c: any) => !c.isFollowing && !c.isJoinPending)
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
        <div className="text-sm">
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
                <Link
                  href={`/tournaments/${club.nextTournament.id}/register`}
                  className="ml-auto"
                >
                  <Button size="sm">
                    {typeof club.nextTournament.entryFeeCents === 'number' &&
                    club.nextTournament.entryFeeCents > 0
                      ? 'Pay & Join'
                      : 'Join'}
                  </Button>
                </Link>
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
          <Button
            variant={club.isJoinPending ? 'outline' : club.isFollowing ? 'secondary' : 'default'}
            className="flex-1"
            onClick={() => (club.isJoinPending ? onCancelJoin(club.id) : onToggleFollow(club.id))}
            disabled={toggleFollow.isPending || cancelJoinRequest.isPending}
            title={!isLoggedIn ? 'Sign in to join clubs' : undefined}
          >
            {club.isFollowing
              ? 'Joined'
              : club.isJoinPending
                ? 'Cancel'
                : club.joinPolicy === 'APPROVAL'
                  ? 'Request'
                  : 'Join'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6 px-6 py-8">
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
                className="w-full h-10 px-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    </div>
  )
}
