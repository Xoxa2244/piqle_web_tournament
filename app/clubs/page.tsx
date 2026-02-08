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

export const dynamic = 'force-dynamic'

export default function ClubsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const [query, setQuery] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [hasBooking, setHasBooking] = useState(false)

  const listInput = useMemo(() => {
    const trimmed = query.trim()
    return {
      ...(trimmed ? { query: trimmed } : {}),
      ...(verifiedOnly ? { verifiedOnly: true } : {}),
      ...(hasBooking ? { hasBooking: true } : {}),
    }
  }, [query, verifiedOnly, hasBooking])

  const { data: clubs, isLoading } = trpc.club.list.useQuery(listInput)

  const toggleFollow = trpc.club.toggleFollow.useMutation()
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

  const followingClubs = useMemo(() => {
    if (!isLoggedIn) return []
    return (clubs ?? []).filter((c) => c.isFollowing)
  }, [clubs, isLoggedIn])

  const discoverClubs = useMemo(() => {
    if (!isLoggedIn) return clubs ?? []
    return (clubs ?? []).filter((c) => !c.isFollowing)
  }, [clubs, isLoggedIn])

  const renderClubCard = (club: any) => (
    <Card key={club.id} className="flex flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg truncate">{club.name}</CardTitle>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="truncate">
                {club.city || club.state ? `${club.city ?? ''}${club.city && club.state ? ', ' : ''}${club.state ?? ''}` : 'Location not set'}
              </span>
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
            {club.followersCount} follower{club.followersCount === 1 ? '' : 's'}
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
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">No upcoming tournaments yet.</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/clubs/${club.id}`} className="flex-1">
            <Button variant="outline" className="w-full">
              View
            </Button>
          </Link>
          <Button
            variant={club.isFollowing ? 'secondary' : 'default'}
            className="flex-1"
            onClick={() => onToggleFollow(club.id)}
            disabled={toggleFollow.isPending}
            title={!isLoggedIn ? 'Sign in to follow clubs' : undefined}
          >
            {club.isFollowing ? 'Following' : 'Follow'}
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
            Follow clubs to get updates and discover upcoming events.
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
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={verifiedOnly} onCheckedChange={(v) => setVerifiedOnly(Boolean(v))} />
              Verified only
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={hasBooking} onCheckedChange={(v) => setHasBooking(Boolean(v))} />
              Has booking
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
          <h2 className="text-sm font-semibold text-gray-900">Following</h2>
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
