'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Users, Trophy, ThumbsUp, ThumbsDown, Search, User as UserIcon, MessageCircle, X, Send, MoreVertical, Trash2, AlertTriangle, ClipboardList } from 'lucide-react'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { useToast } from '@/components/ui/use-toast'
import ShareButton from '@/components/ShareButton'
import ComplaintModal from '@/components/ComplaintModal'
import { Checkbox } from '@/components/ui/checkbox'

type FilterType = 'my' | 'all'
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

export default function HomePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [filterUpcoming, setFilterUpcoming] = useState(true)
  const [filterInProgress, setFilterInProgress] = useState(true)
  const [filterPast, setFilterPast] = useState(false)
  const [sortBy, setSortBy] = useState<SortType>('date-desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [avatarError, setAvatarError] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [commentText, setCommentText] = useState('')
  const [openCommentMenu, setOpenCommentMenu] = useState<string | null>(null)
  const [reportCommentModal, setReportCommentModal] = useState<{commentId: string, commentText: string, authorName: string, authorEmail: string} | null>(null)
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()

  // Set base URL on client side only to avoid hydration mismatch
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  // Reset description expanded when opening/closing modal
  useEffect(() => {
    if (!selectedTournament) setDescriptionExpanded(false)
  }, [selectedTournament])
  
  // Get ratings for all tournaments
  const tournamentIds = useMemo(() => {
    return tournaments?.map(t => t.id) || []
  }, [tournaments])

  const { data: registrationStatuses } = trpc.registration.getMyStatuses.useQuery(
    { tournamentIds },
    { enabled: !!session && tournamentIds.length > 0 }
  )
  
  const utils = trpc.useUtils()
  
  const { data: ratingsData } = trpc.rating.getTournamentRatings.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )

  const { data: commentCounts } = trpc.comment.getTournamentCommentCounts.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )

  const { data: comments, refetch: refetchComments } = trpc.comment.getTournamentComments.useQuery(
    { tournamentId: selectedTournament || '' },
    { enabled: !!selectedTournament }
  )
  
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

  const createComment = trpc.comment.createComment.useMutation({
    onSuccess: () => {
      setCommentText('')
      refetchComments()
      utils.comment.getTournamentCommentCounts.invalidate({ tournamentIds })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const deleteComment = trpc.comment.deleteComment.useMutation({
    onSuccess: () => {
      setOpenCommentMenu(null)
      refetchComments()
      utils.comment.getTournamentCommentCounts.invalidate({ tournamentIds })
      toast({
        title: 'Success',
        description: 'Comment deleted successfully',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleLogout = useCallback(async () => {
    await signOut({ callbackUrl: '/' })
  }, [])

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

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  // Tournament status: past (ended), upcoming (not started), in_progress (ongoing)
  const getTournamentStatus = (tournament: { startDate: Date | string; endDate: Date | string }): 'past' | 'upcoming' | 'in_progress' => {
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

  const getTournamentStatusLabel = (status: 'past' | 'upcoming' | 'in_progress') => {
    switch (status) {
      case 'past': return 'Past'
      case 'upcoming': return 'Upcoming'
      case 'in_progress': return 'In progress'
    }
  }

  const getTournamentStatusBadgeClass = (status: 'past' | 'upcoming' | 'in_progress') => {
    switch (status) {
      case 'past': return 'bg-gray-100 text-gray-700'
      case 'upcoming': return 'bg-blue-50 text-blue-700'
      case 'in_progress': return 'bg-green-50 text-green-700'
    }
  }

  const isRegistrationOpen = (tournament: any): boolean => {
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
        ? filtered.filter(tournament => (tournament as any).user?.id === session.user.id)
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
  }, [tournaments, filter, searchQuery, filterUpcoming, filterInProgress, filterPast, session?.user?.id])

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
    // Don't open modal if clicking on View Results button or its parent Link
    const target = e.target as HTMLElement
    if (target.closest('a[href*="/scoreboard/"]') || target.closest('button')) {
      return
    }
    setSelectedTournament(tournamentId)
  }

  const handleCommentSubmit = () => {
    if (!selectedTournament || !commentText.trim()) return
    if (!session) {
      toast({
        title: 'Login Required',
        description: 'Please log in to post comments.',
        variant: 'default',
      })
      return
    }
    createComment.mutate({
      tournamentId: selectedTournament,
      text: commentText.trim(),
    })
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

  const hasValidAvatar = Boolean(session?.user?.image && 
    session.user.image.trim() !== '' &&
    (session.user.image.startsWith('http') || session.user.image.startsWith('data:')))
  
  const avatarSrc = session?.user?.image || ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar: nav links and profile (outside the title header) */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-3 flex items-center justify-end gap-3">
            <Link
              href="/admin"
              className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
            >
              Tournaments
            </Link>
            {session ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
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
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                    </div>
                  )}
                  <span className="hidden sm:inline">
                    {session?.user?.name || 'Profile'}
                  </span>
                </Link>
                <button
                  onClick={(e) => {
                    if (!session) {
                      e.preventDefault()
                      router.push('/auth/signin')
                    } else {
                      router.push('/admin/new')
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Create New Tournament
                </button>
                <button
                  onClick={handleLogout}
                  className="text-red-600 hover:text-red-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Login
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Page Header: only title, subtitle, search, filters (as in Val / screenshot) */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
              <p className="text-gray-600 mt-2">Select a tournament to view results</p>
            </div>

            {/* Search Input */}
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search tournaments by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 max-w-md"
                />
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
                  className="text-sm border border-gray-300 rounded-md pl-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.75rem_center] pr-[2.5rem]"
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
        {publicTournaments.length > 0 ? (
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
                      url={`${baseUrl}/scoreboard/${tournament.id}`}
                      title={tournament.title}
                      iconOnly
                      size="sm"
                      variant="ghost"
                      className="text-gray-500 hover:text-gray-700"
                    />
                  </div>
                )}
                <CardHeader className="flex-shrink-0">
                  <div className="flex items-start gap-3">
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
                      <CardTitle className="text-xl pr-10">{tournament.title}</CardTitle>
                    </div>
                  </div>
                  {/* Tournament status badge */}
                  <div className="mt-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTournamentStatusBadgeClass(getTournamentStatus(tournament))}`}>
                      {getTournamentStatusLabel(getTournamentStatus(tournament))}
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
                          {new Date(tournament.startDate).toLocaleDateString()} - {new Date(tournament.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {((tournament as any).registrationStartDate || (tournament as any).registrationEndDate) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <ClipboardList className="h-4 w-4 mr-2" />
                          <span>
                            Registration: {(tournament as any).registrationStartDate
                              ? new Date((tournament as any).registrationStartDate).toLocaleDateString()
                              : '—'}
                            {' – '}
                            {(tournament as any).registrationEndDate
                              ? new Date((tournament as any).registrationEndDate).toLocaleDateString()
                              : '—'}
                          </span>
                        </div>
                      )}
                      
                      {tournament.venueName && (
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2" />
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

                    {/* Tournament Director */}
                    {tournament.user && (
                      <div className="mt-4 pt-2 border-t border-gray-200">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">Tournament Director:</span>
                          <Link
                            href={`/profile/${tournament.user.id}`}
                            className="flex items-center space-x-1.5 text-gray-700 hover:text-gray-900 transition-colors group"
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
                      </div>
                    )}
                  </div>

                  {/* Fixed bottom section: Like/Dislike, View Results, Join Tournament */}
                  <div className="pt-4 border-t border-gray-200 mt-auto flex-shrink-0 space-y-3">
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

                    {/* View Results Button */}
                    <Link href={`/scoreboard/${tournament.id}`}>
                      <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                        View Results
                      </Button>
                    </Link>

                    {(() => {
                      const status = registrationStatuses?.[tournament.id]?.status ?? 'none'
                      const registrationOpen = isRegistrationOpen(tournament)
                      const label =
                        status === 'active'
                          ? 'Cancel Registration'
                          : status === 'waitlisted'
                          ? 'Leave Waitlist'
                          : 'Join Tournament'

                      return (
                        <Button
                          className="w-full"
                          variant={status === 'active' ? 'destructive' : 'default'}
                          disabled={!registrationOpen}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!session) {
                              router.push(`/auth/signin?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.id}/register`)}`)
                              return
                            }
                            if (status === 'active') {
                              if (confirm('Cancel registration?')) {
                                cancelRegistration.mutate({ tournamentId: tournament.id })
                              }
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

      {/* Tournament Details & Comments Modal */}
      {selectedTournament && (() => {
        const tournament = tournaments?.find(t => t.id === selectedTournament)
        if (!tournament) return null
        
        return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => {
              setSelectedTournament(null)
              setCommentText('')
              setDescriptionExpanded(false)
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {(tournament as any).image ? (
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                      <Image
                        src={(tournament as any).image}
                        alt={tournament.title}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <TournamentImagePlaceholder size="lg" />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{tournament.title}</h2>
                    <p className="text-gray-600 mt-1">Tournament Details & Comments</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(tournament as any).user?.id === session?.user?.id && (
                    <>
                      <Link href={`/admin/${tournament.id}`}>
                        <Button className="bg-gray-900 hover:bg-gray-800 text-white">
                          Manage
                        </Button>
                      </Link>
                      {(tournament as any).publicSlug && (
                        <Link href={`/t/${(tournament as any).publicSlug}`}>
                          <Button className="bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300">
                            View Board
                          </Button>
                        </Link>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => {
                      setSelectedTournament(null)
                      setCommentText('')
                      setDescriptionExpanded(false)
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                {/* Left Side - Tournament Info */}
                <div className="w-full lg:w-1/2 border-r-0 lg:border-r border-gray-200 overflow-y-auto p-6">
                  <div className="space-y-4">
                    
                    {/* Description */}
                    {tournament.description && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                        <div 
                          className={`text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none ${!descriptionExpanded ? 'line-clamp-3' : ''}`}
                          dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                        />
                        {(tournament.description.split('\n').length > 3 || tournament.description.length > 150) && (
                          <button
                            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                          >
                            {descriptionExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Tournament Info */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Information</h3>
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          <span>
                            {new Date(tournament.startDate).toLocaleDateString()} - {new Date(tournament.endDate).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {((tournament as any).registrationStartDate || (tournament as any).registrationEndDate) && (
                          <div className="flex items-center text-sm text-gray-600">
                            <ClipboardList className="h-4 w-4 mr-2" />
                            <span>
                              Registration: {(tournament as any).registrationStartDate
                                ? new Date((tournament as any).registrationStartDate).toLocaleDateString()
                                : '—'}
                              {' – '}
                              {(tournament as any).registrationEndDate
                                ? new Date((tournament as any).registrationEndDate).toLocaleDateString()
                                : '—'}
                            </span>
                          </div>
                        )}
                        
                        {tournament.venueName && (
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="h-4 w-4 mr-2" />
                            <span>{tournament.venueName}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center text-sm text-gray-600">
                          <Users className="h-4 w-4 mr-2" />
                          <span>{tournament.divisions.length} division{tournament.divisions.length !== 1 ? 's' : ''}</span>
                        </div>

                        {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Trophy className="h-4 w-4 mr-2" />
                            <span>Entry Fee: ${tournament.entryFee}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Divisions */}
                    {tournament.divisions.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Divisions</h3>
                        <div className="flex flex-wrap gap-2">
                          {(tournament.divisions as any[]).map((division: any) => (
                            <Badge key={division.id} variant="secondary">
                              {division.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tournament Director */}
                    {tournament.user && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Director</h3>
                        <Link
                          href={`/profile/${tournament.user.id}`}
                          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          <AvatarImage
                            src={(tournament.user as { image?: string | null }).image}
                            alt={tournament.user.name || tournament.user.email || 'TD'}
                            userId={tournament.user.id}
                            size={32}
                          />
                          <span className="font-medium">
                            {tournament.user.name || tournament.user.email}
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side - Comments */}
                <div className="w-full lg:w-1/2 overflow-y-auto flex flex-col border-t lg:border-t-0 border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Comments ({commentCounts?.[selectedTournament] || 0})
                    </h3>
                  </div>
                  
                  {/* Comments List */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {comments && comments.length > 0 ? (
                      comments.map((comment) => {
                        const isOwnComment = session?.user?.id === comment.user.id
                        return (
                          <div key={comment.id} className="border-b border-gray-100 pb-4 last:border-0 relative">
                            <div className="flex items-start space-x-3">
                              <AvatarImage
                                src={comment.user.image}
                                alt={comment.user.name || comment.user.email || 'User'}
                                userId={comment.user.id}
                                size={32}
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium text-sm text-gray-900">
                                      {comment.user.name || comment.user.email}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <button
                                      onClick={() => setOpenCommentMenu(openCommentMenu === comment.id ? null : comment.id)}
                                      className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {openCommentMenu === comment.id && (
                                      <>
                                        <div 
                                          className="fixed inset-0 z-10" 
                                          onClick={() => setOpenCommentMenu(null)}
                                        />
                                        <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                                          {isOwnComment && (
                                            <button
                                              onClick={() => {
                                                setOpenCommentMenu(null)
                                                if (confirm('Are you sure you want to delete this comment?')) {
                                                  deleteComment.mutate({ commentId: comment.id })
                                                }
                                              }}
                                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                              <span>Delete</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              setOpenCommentMenu(null)
                                              setReportCommentModal({
                                                commentId: comment.id,
                                                commentText: comment.text,
                                                authorName: comment.user.name || 'Unknown',
                                                authorEmail: comment.user.email || ''
                                              })
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                                          >
                                            <AlertTriangle className="h-4 w-4" />
                                            <span>Report</span>
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                  {comment.text}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No comments yet. Be the first to comment!</p>
                      </div>
                    )}
                  </div>

                  {/* Comment Input */}
                  {session ? (
                    <div className="p-6 border-t border-gray-200">
                      <div className="flex space-x-2">
                        <Input
                          placeholder="Write a comment..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleCommentSubmit()
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleCommentSubmit}
                          disabled={!commentText.trim() || createComment.isPending}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 border-t border-gray-200 text-center">
                      <p className="text-sm text-gray-500 mb-2">Please log in to post comments</p>
                      <Link href="/auth/signin">
                        <Button variant="outline" size="sm">
                          Login
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* Comment Report Modal */}
      {reportCommentModal && selectedTournament && (() => {
        const tournament = tournaments?.find(t => t.id === selectedTournament)
        return (
          <ComplaintModal
            isOpen={!!reportCommentModal}
            onClose={() => setReportCommentModal(null)}
            tournamentId={selectedTournament}
            tournamentTitle={tournament?.title}
            commentId={reportCommentModal.commentId}
            commentText={reportCommentModal.commentText}
            commentAuthorName={reportCommentModal.authorName}
            commentAuthorEmail={reportCommentModal.authorEmail}
          />
        )
      })()}
    </div>
  )
}
