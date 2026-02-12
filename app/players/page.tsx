'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatDuprRating } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Search, MapPin, Users, Trophy, Medal } from 'lucide-react'

export const dynamic = 'force-dynamic'

type SortKey = 'name' | 'dupr_desc' | 'activity_desc'

const genderLabel = (gender?: string | null) => {
  if (gender === 'M') return 'Male'
  if (gender === 'F') return 'Female'
  if (gender === 'X') return 'Other'
  return null
}

export default function PlayersPage() {
  const router = useRouter()
  const { status } = useSession()
  const isLoggedIn = status === 'authenticated'

  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [hasDupr, setHasDupr] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('dupr_desc')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent('/players')}`)
    }
  }, [status, router])

  const listInput = useMemo(() => {
    const q = query.trim()
    const c = city.trim()
    return {
      ...(q ? { query: q } : {}),
      ...(c ? { city: c } : {}),
      ...(hasDupr ? { hasDupr: true } : {}),
      limit: 200,
    }
  }, [query, city, hasDupr])

  const { data: players = [], isLoading } = trpc.user.directory.useQuery(listInput, {
    enabled: isLoggedIn,
  })

  const sortedPlayers = useMemo(() => {
    const list = [...players]
    if (sortBy === 'name') {
      list.sort((a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }))
      return list
    }
    if (sortBy === 'activity_desc') {
      list.sort((a: any, b: any) => {
        const aScore = Number(a.tournamentsPlayedCount ?? 0) + Number(a.clubsJoinedCount ?? 0)
        const bScore = Number(b.tournamentsPlayedCount ?? 0) + Number(b.clubsJoinedCount ?? 0)
        return bScore - aScore
      })
      return list
    }
    list.sort((a: any, b: any) => {
      const aRating = Number(a.duprRatingDoubles ?? a.duprRatingSingles ?? -1)
      const bRating = Number(b.duprRatingDoubles ?? b.duprRatingSingles ?? -1)
      return bRating - aRating
    })
    return list
  }, [players, sortBy])

  if (!isLoggedIn && status !== 'loading') {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Players</h1>
        <p className="text-sm text-muted-foreground">
          Directory of registered players on Piqle.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search & filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, or city"
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Carmel"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="dupr_desc">DUPR (high to low)</option>
                <option value="activity_desc">Activity</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm pb-2">
                <Checkbox checked={hasDupr} onCheckedChange={(v) => setHasDupr(Boolean(v))} />
                Has DUPR
              </label>
            </div>
          </div>

          {query.trim() || city.trim() || hasDupr || sortBy !== 'dupr_desc' ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('')
                  setCity('')
                  setHasDupr(false)
                  setSortBy('dupr_desc')
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {isLoading ? 'Loading players…' : `${sortedPlayers.length} player${sortedPlayers.length === 1 ? '' : 's'} found`}
      </div>

      {!isLoading && sortedPlayers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No players found.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedPlayers.map((player: any) => {
          const singles = formatDuprRating(player.duprRatingSingles)
          const doubles = formatDuprRating(player.duprRatingDoubles)
          const gender = genderLabel(player.gender)

          return (
            <Card key={player.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-start gap-3">
                  {player.image ? (
                    <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-200 bg-gray-50">
                      <Image src={player.image} alt="" fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200" />
                  )}
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-gray-900 truncate">{player.name || 'Piqle user'}</div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{player.city || 'City not set'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {gender ? <Badge variant="outline">{gender}</Badge> : null}
                  {player.hasDupr ? <Badge>DUPR</Badge> : <Badge variant="secondary">No DUPR</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-gray-50 p-2">
                    <div className="text-muted-foreground">Singles</div>
                    <div className="text-sm font-medium text-gray-900">{singles ?? '—'}</div>
                  </div>
                  <div className="rounded-md border bg-gray-50 p-2">
                    <div className="text-muted-foreground">Doubles</div>
                    <div className="text-sm font-medium text-gray-900">{doubles ?? '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border p-2 text-center">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-medium text-gray-900">{player.clubsJoinedCount}</div>
                    <div className="text-muted-foreground">clubs</div>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Trophy className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-medium text-gray-900">{player.tournamentsPlayedCount}</div>
                    <div className="text-muted-foreground">played</div>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Medal className="h-3.5 w-3.5" />
                    </div>
                    <div className="font-medium text-gray-900">{player.tournamentsCreatedCount}</div>
                    <div className="text-muted-foreground">created</div>
                  </div>
                </div>

                <Link href={`/profile/${player.id}`} className="block">
                  <Button variant="outline" className="w-full">
                    View profile
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
