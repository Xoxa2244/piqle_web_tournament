'use client'

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { formatUsDateShort, formatUsDateTimeShort, getTimezoneLabel } from '@/lib/dateFormat'
import {
  getTournamentStatus,
  getTournamentStatusBadgeClass,
  getTournamentStatusLabel,
} from '@/lib/tournamentStatus'
import { getTournamentTypeLabel } from '@/lib/tournamentType'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, Clock3, MapPin, Users, Trophy, ThumbsUp, ThumbsDown, Search, User as UserIcon, MessageCircle, X, Send, MoreVertical, Trash2, AlertTriangle, ClipboardList } from 'lucide-react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useToast } from '@/components/ui/use-toast'
import ShareButton from '@/components/ShareButton'
import TournamentModal from '@/components/TournamentModal'
import CancelRegistrationModal from '@/components/CancelRegistrationModal'
import { Checkbox } from '@/components/ui/checkbox'
import { TournamentsMapContent } from '@/components/TournamentsMapContent'

type FilterType = 'my' | 'all' | 'map'
type SortType = 'date-desc' | 'date-asc'

// Placeholder when tournament has no image. Uses public/tournament-placeholder.png.
function TournamentImagePlaceholder({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const [showFallback, setShowFallback] = useState(true)
  const sizeClass = size === 'lg' ? 'w-20 h-20' : 'w-11 h-11'
  const iconSize = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return (
    <div className={`${sizeClass} flex-shrink-0 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden relative`}>
      <img
        src="/tournament-placeholder.png"
        alt=""
        className="w-full h-full object-cover"
        onLoad={() => setShowFallback(false)}
        onError={() => setShowFallback(true)}
      />
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
          <Trophy className={`${iconSize} text-gray-400`} />
        </div>
      )}
    </div>
  )
}

// Helper component for avatar display
function AvatarImage({ 
  src, 
  alt, 
  userId,
  size = 20 
}: { 
  src?: string | null
  alt: string
  userId: string
  size?: number
}) {
  const [avatarError, setAvatarError] = useState(false)
  const hasValidAvatar = Boolean(src && 
    src.trim() !== '' &&
    (src.startsWith('http') || src.startsWith('data:')))

  if (hasValidAvatar && !avatarError && src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="rounded-full object-cover"
        onError={() => setAvatarError(true)}
      />
    )
  }

  const iconSize = Math.round(size * 0.6)
  return (
    <div 
      className="rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300"
      style={{ width: size, height: size }}
    >
      <UserIcon style={{ width: iconSize, height: iconSize }} className="text-gray-500" />
    </div>
  )
}

function HomePageContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [mapFocusTournamentId, setMapFocusTournamentId] = useState<string | null>(null)
  const [cancelModalTournament, setCancelModalTournament] = useState<{ tournamentId: string; isPaid: boolean } | null>(null)
  const [filterUpcoming, setFilterUpcoming] = useState(true)
  const [filterInProgress, setFilterInProgress] = useState(true)
  const [filterPast, setFilterPast] = useState(false)
  const [sortBy, setSortBy] = useState<SortType>('date-desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [baseUrl, setBaseUrl] = useState<string>('')
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()

  // Set base URL on client side only to avoid hydration mismatch
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  // Open tournament modal when landing with ?open=<tournamentId> (e.g. from invitation email "View details")
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || !tournaments?.length) return
    const exists = tournaments.some(t => t.id === openId)
    if (exists) {
      setSelectedTournament(openId)
    }
  }, [searchParams, tournaments])

  // Get ratings for all tournaments
  const tournamentIds = useMemo(() => {
    return tournaments?.map(t => t.id) || []
  }, [tournaments])

  const utils = trpc.useUtils()
  
  const { data: ratingsData } = trpc.rating.getTournamentRatings.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )

  const { data: registrationStatuses } = trpc.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: !!session && tournamentIds.length > 0 }
  )

  const { data: commentCounts } = trpc.comment.getTournamentCommentCounts.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )
  
  const cancelRegistration = trpc.registration.cancelRegistration.useMutation({
    onSuccess: () => {
      utils.registration.getMyStatuses.invalidate({ tournamentIds })
    },
  })

  const leaveWaitlist = trpc.registration.leaveWaitlist.useMutation({
    onSuccess: () => {
      utils.registration.getMyStatuses.invalidate({ tournamentIds })
    },
  })
  
  const toggleRating = trpc.rating.toggleRating.useMutation({
    onMutate: async ({ tournamentId, rating }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await utils.rating.getTournamentRatings.cancel({ tournamentIds })

      // Snapshot the previous value
      const previousRatings = utils.rating.getTournamentRatings.getData({ tournamentIds })

      // Optimistically update the cache
      if (previousRatings) {
        const currentRating = previousRatings[tournamentId]
        if (currentRating) {
          const newRating = { ...currentRating }
          
          // Determine the action based on current state
          if (currentRating.userRating === rating) {
            // Removing rating (clicking same button)
            newRating.userRating = null
            if (rating === 'LIKE') {
              newRating.likes = Math.max(0, currentRating.likes - 1)
            } else {
              newRating.dislikes = Math.max(0, currentRating.dislikes - 1)
            }
          } else if (currentRating.userRating === null) {
            // Adding new rating
            newRating.userRating = rating
            if (rating === 'LIKE') {
              newRating.likes = currentRating.likes + 1
            } else {
              newRating.dislikes = currentRating.dislikes + 1
            }
          } else {
            // Switching rating (from LIKE to DISLIKE or vice versa)
            newRating.userRating = rating
            if (rating === 'LIKE') {
              newRating.likes = currentRating.likes + 1
              newRating.dislikes = Math.max(0, currentRating.dislikes - 1)
            } else {
              newRating.dislikes = currentRating.dislikes + 1
              newRating.likes = Math.max(0, currentRating.likes - 1)
            }
          }
          
          // Recalculate karma
          newRating.karma = newRating.likes - newRating.dislikes
          
          // Update the cache
          utils.rating.getTournamentRatings.setData(
            { tournamentIds },
            {
              ...previousRatings,
              [tournamentId]: newRating,
            }
          )
        }
      }

      // Return context with the previous value for rollback
      return { previousRatings }
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousRatings) {
        utils.rating.getTournamentRatings.setData(
          { tournamentIds },
          context.previousRatings
        )
      }
    },
    onSuccess: () => {
      // Invalidate and refetch ratings after mutation to ensure consistency
      utils.rating.getTournamentRatings.invalidate({ tournamentIds })
      // Also refetch tournaments to update karma sorting
      utils.public.listBoards.invalidate()
    },
  })

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  const closeTournamentModal = useCallback(() => {
    setSelectedTournament(null)

    const params = new URLSearchParams(searchParams.toString())
    if (params.has('open')) {
      params.delete('open')
      const nextQuery = params.toString()
      router.replace(nextQuery ? `/?${nextQuery}` : '/', { scroll: false })
    }
  }, [router, searchParams])

  const isRegistrationOpen = (tournament: { registrationStartDate?: Date | string | null; registrationEndDate?: Date | string | null; startDate: Date | string }): boolean => {
    const start = tournament.registrationStartDate ? new Date(tournament.registrationStartDate) : new Date(tournament.startDate)
    const end = tournament.registrationEndDate ? new Date(tournament.registrationEndDate) : new Date(tournament.startDate)
    const now = new Date()
    return now >= start && now <= end
  }

  // Filter tournaments based on selected filter, search query, and status checkboxes
  const filteredTournaments = useMemo(() => {
    if (!tournaments) return []
    
    let filtered = tournaments
    
    // Tab: My tournaments vs All tournaments
    if (filter === 'my') {
      filtered = session?.user?.id
        ? filtered.filter((tournament) => {
            const isOwner = (tournament as any).user?.id === session.user.id
            const registrationStatus = registrationStatuses?.[tournament.id]?.status ?? 'none'
            const isParticipant = registrationStatus !== 'none'
            return isOwner || isParticipant
          })
        : []
    }
    
    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(tournament =>
        tournament.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Status checkboxes
    if (filterUpcoming || filterInProgress || filterPast) {
      filtered = filtered.filter(tournament => {
        const status = getTournamentStatus(tournament)
        const matches = []
        if (filterUpcoming) matches.push(status === 'upcoming')
        if (filterInProgress) matches.push(status === 'in_progress')
        if (filterPast) matches.push(status === 'past')
        return matches.some(Boolean)
      })
    }
    
    return filtered
  }, [tournaments, filter, searchQuery, filterUpcoming, filterInProgress, filterPast, session?.user?.id, registrationStatuses])

  // Sort tournaments by date
  const sortedTournaments = useMemo(() => {
    const sorted = [...filteredTournaments]
    sorted.sort((a, b) => {
      const dateA = new Date(a.startDate).getTime()
      const dateB = new Date(b.startDate).getTime()
      return sortBy === 'date-desc' ? dateB - dateA : dateA - dateB
    })
    return sorted
  }, [filteredTournaments, sortBy])
  
  const handleRatingClick = async (tournamentId: string, rating: 'LIKE' | 'DISLIKE') => {
    if (!session) {
      toast({
        title: 'Login Required',
        description: 'Please log in to like or dislike tournaments.',
        variant: 'default',
      })
      return
    }
    
    try {
      await toggleRating.mutateAsync({ tournamentId, rating })
      // Refetch ratings after mutation
      // The query will automatically refetch due to React Query invalidation
    } catch (error) {
      console.error('Error toggling rating:', error)
    }
  }

  const handleCardClick = (tournamentId: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('a')) return
    setSelectedTournament(tournamentId)
  }

  if (isLoading) {
  return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tournaments...</p>
        </div>
        </div>
    )
  }

  const publicTournaments = sortedTournaments

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header: title, subtitle, search, filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
              <p className="text-gray-600 mt-2">Select a tournament to view results</p>
            </div>

            {/* Search Input */}
            <div className="mt-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search tournaments by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs + Status Checkboxes + Sort */}
            <div className="mt-4 flex flex-wrap items-center gap-4 pb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 font-medium text-sm transition-colors rounded-t ${
                    filter === 'all'
                      ? 'text-blue-600 border-b-2 border-blue-600 -mb-[1px]'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All tournaments
                </button>
                <button
                  onClick={() => setFilter('my')}
                  className={`px-4 py-2 font-medium text-sm transition-colors rounded-t ${
                    filter === 'my'
                      ? 'text-blue-600 border-b-2 border-blue-600 -mb-[1px]'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  My tournaments
                </button>
                <button
                  onClick={() => setFilter('map')}
                  className={`px-4 py-2 font-medium text-sm transition-colors rounded-t ${
                    filter === 'map'
                      ? 'text-blue-600 border-b-2 border-blue-600 -mb-[1px]'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  View on Map
                </button>
              </div>
              <div className="flex items-center gap-4 ml-auto">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <Checkbox
                    checked={filterUpcoming}
                    onCheckedChange={(checked) => setFilterUpcoming(checked === true)}
                  />
                  <span>Upcoming</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <Checkbox
                    checked={filterInProgress}
                    onCheckedChange={(checked) => setFilterInProgress(checked === true)}
                  />
                  <span>In progress</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <Checkbox
                    checked={filterPast}
                    onCheckedChange={(checked) => setFilterPast(checked === true)}
                  />
                  <span>Past</span>
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortType)}
                  disabled={filter === 'map'}
                  className={`text-sm border border-gray-300 rounded-md pl-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center] pr-[2.5rem] ${filter === 'map' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  }}
                >
                  <option value="date-desc">Newest first</option>
                  <option value="date-asc">Oldest first</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filter === 'map' ? (
          <TournamentsMapContent
            searchQuery={searchQuery}
            filterUpcoming={filterUpcoming}
            filterInProgress={filterInProgress}
            filterPast={filterPast}
            focusTournamentId={mapFocusTournamentId}
            onFocusConsumed={() => setMapFocusTournamentId(null)}
            onOpenTournament={setSelectedTournament}
          />
        ) : publicTournaments.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {publicTournaments.map((tournament) => (
              <Card 
                key={tournament.id} 
                className="hover:shadow-lg transition-shadow relative flex flex-col h-full cursor-pointer"
                onClick={(e) => handleCardClick(tournament.id, e)}
              >
                {baseUrl && (
                  <div className="absolute top-4 right-4 z-10">
                    <ShareButton
                      url={`${baseUrl}/?open=${tournament.id}`}
                      title={tournament.title}
                      iconOnly
                      size="sm"
                      variant="ghost"
                      className="text-gray-500 hover:text-gray-700"
                    />
                  </div>
                )}
                <CardHeader className="flex-shrink-0">
                  <div className="flex items-center gap-3">
                    {(tournament as any).image ? (
                      <div className="w-11 h-11 flex-shrink-0 relative overflow-hidden rounded-lg">
                        <Image
                          src={(tournament as any).image}
                          alt={tournament.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <TournamentImagePlaceholder />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl pr-10 line-clamp-2 break-words">{tournament.title}</CardTitle>
                    </div>
                  </div>
                  {/* Tournament status badge */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}>
                      {getTournamentStatusLabel(getTournamentStatus(tournament))}
                    </span>
                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
                      {getTournamentTypeLabel((tournament as { format?: string | null }).format)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 flex-grow flex flex-col">
                  <div className="flex-grow">
                    {/* Tournament Info */}
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>
                          {formatUsDateTimeShort(tournament.startDate, { timeZone: (tournament as any).timezone })} - {formatUsDateTimeShort(tournament.endDate, { timeZone: (tournament as any).timezone })}
                        </span>
                      </div>
                      
                      {((tournament as any).registrationStartDate || (tournament as any).registrationEndDate) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <ClipboardList className="h-4 w-4 mr-2" />
                          <span>
                            Registration: {(tournament as any).registrationStartDate
                              ? formatUsDateTimeShort((tournament as any).registrationStartDate, { timeZone: (tournament as any).timezone })
                              : '—'}
                            {' – '}
                            {(tournament as any).registrationEndDate
                              ? formatUsDateTimeShort((tournament as any).registrationEndDate, { timeZone: (tournament as any).timezone })
                              : '—'}
                          </span>
                        </div>
                      )}

                      {(tournament as any).timezone ? (
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock3 className="h-4 w-4 mr-2" />
                          <span>{getTimezoneLabel((tournament as any).timezone)}</span>
                        </div>
                      ) : null}
                      {tournament.venueName && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            setFilter('map')
                            setMapFocusTournamentId(tournament.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              setFilter('map')
                              setMapFocusTournamentId(tournament.id)
                            }
                          }}
                          className={`flex items-center text-sm cursor-pointer hover:underline ${(tournament as { venueAddress?: string | null }).venueAddress?.trim() ? 'text-blue-600 hover:text-blue-800' : 'text-gray-600 hover:text-blue-600'}`}
                        >
                          <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span>{tournament.venueName}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        <span>{tournament.divisions.length} division{tournament.divisions.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Divisions */}
                    {tournament.divisions.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Divisions:</h4>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {(tournament.divisions as any[]).slice(0, 8).map((division: any) => (
                            <Badge key={division.id} variant="secondary" className="text-xs">
                              {division.name}
                            </Badge>
                          ))}
                          {tournament.divisions.length > 8 && (
                            <Badge variant="secondary" className="text-xs">
                              +{tournament.divisions.length - 8} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Entry Fee */}
                    {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                      <div className="mt-4 flex items-center text-sm text-gray-600">
                        <Trophy className="h-4 w-4 mr-2" />
                        <span>Entry Fee: ${tournament.entryFee}</span>
                      </div>
                    )}
                  </div>

                  {/* Fixed bottom section: Tournament Director, Like/Dislike, Join — same strip as on /admin */}
                  <div className="pt-4 border-t border-gray-200 mt-auto flex-shrink-0 space-y-3">
                    {/* Tournament Director — on the same divider strip */}
                    {tournament.user && (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Tournament Director:</span>
                        <Link
                          href={session?.user?.id && String(tournament.user.id) === String(session.user.id) ? '/profile' : `/profile/${tournament.user.id}`}
                          className="flex items-center space-x-1.5 text-gray-700 hover:text-gray-900 transition-colors group"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AvatarImage
                            src={(tournament.user as { image?: string | null }).image}
                            alt={tournament.user.name || tournament.user.email || 'TD'}
                            userId={tournament.user.id}
                            size={18}
                          />
                          <span className="text-xs font-medium group-hover:underline">
                            {tournament.user.name || tournament.user.email}
                          </span>
                        </Link>
                      </div>
                    )}
                    {/* Like/Dislike/Comments Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRatingClick(tournament.id, 'LIKE')
                        }}
                        disabled={toggleRating.isPending}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
                          ratingsData?.[tournament.id]?.userRating === 'LIKE'
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span>{ratingsData?.[tournament.id]?.likes || tournament.likes || 0}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRatingClick(tournament.id, 'DISLIKE')
                        }}
                        disabled={toggleRating.isPending}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
                          ratingsData?.[tournament.id]?.userRating === 'DISLIKE'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        <span>{ratingsData?.[tournament.id]?.dislikes || tournament.dislikes || 0}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTournament(tournament.id)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors text-gray-600 hover:bg-gray-100"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>{commentCounts?.[tournament.id] || 0}</span>
                      </button>
                    </div>

                    {(() => {
                      const status = registrationStatuses?.[tournament.id]?.status ?? 'none'
                      const registrationOpen = isRegistrationOpen(tournament)
                      const isPaidTournament = !!(tournament.entryFee && parseFloat(String(tournament.entryFee)) > 0)
                      const isActiveUnpaid = status === 'active' && isPaidTournament && !registrationStatuses?.[tournament.id]?.isPaid
                      const label =
                        status === 'active'
                          ? 'Cancel Registration'
                          : status === 'waitlisted'
                          ? 'Leave Waitlist'
                          : 'Join Tournament'

                      return (
                        <div className="flex flex-col gap-2">
                          {isActiveUnpaid && (
                            <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white" asChild>
                              <Link
                                href={`/tournaments/${tournament.id}/register`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Pay Now ${tournament.entryFee != null ? Number(tournament.entryFee).toFixed(2) : '0.00'}
                              </Link>
                            </Button>
                          )}
                          <Button
                            className={`w-full ${label === 'Join Tournament' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                            variant={label === 'Join Tournament' ? undefined : status === 'active' ? 'destructive' : 'default'}
                            disabled={!registrationOpen}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!session) {
                                router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.id}/register`)}`)
                                return
                              }
                              if (status === 'active') {
                                setCancelModalTournament({
                                  tournamentId: tournament.id,
                                  isPaid: isPaidTournament,
                                })
                                return
                              }
                              if (status === 'waitlisted') {
                                const divisionId = registrationStatuses?.[tournament.id]?.divisionId
                                if (divisionId && confirm('Leave waitlist?')) {
                                  leaveWaitlist.mutate({ divisionId })
                                }
                                return
                              }
                              router.push(`/tournaments/${tournament.id}/register`)
                            }}
                          >
                            {label}
                          </Button>
                        </div>
                      )
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filter === 'my' && !session ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">Sign in to view your tournaments</p>
            <Link href="/auth/signin">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Public Tournaments Available</h3>
            <p className="text-gray-600">
              There are currently no tournaments with public results enabled.
            </p>
          </div>
        )}
      </div>

      <CancelRegistrationModal
        open={!!cancelModalTournament}
        onClose={() => setCancelModalTournament(null)}
        onConfirm={() => {
          if (!cancelModalTournament) return
          cancelRegistration.mutate({ tournamentId: cancelModalTournament.tournamentId })
          setCancelModalTournament(null)
        }}
        isPending={cancelRegistration.isPending}
        isPaidTournament={cancelModalTournament?.isPaid ?? false}
      />

      <TournamentModal
        tournamentId={selectedTournament}
        onClose={closeTournamentModal}
        onVenueClick={(id) => {
          setFilter('map')
          setMapFocusTournamentId(id)
          closeTournamentModal()
        }}
      />

      {/* Description Modal */}
      {selectedDescription && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDescription(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedDescription.title}</h2>
              <p className="text-gray-600 mt-1">Tournament Description</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div 
                className="text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatDescription(selectedDescription.description) }}
              />
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <Button
                onClick={() => setSelectedDescription(null)}
                variant="outline"
                className="px-6"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  )
}
