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
import { Calendar, MapPin, Users, Trophy, Eye, ThumbsUp, ThumbsDown, Search, User as UserIcon, MessageCircle, X, Send, MoreVertical, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { useToast } from '@/components/ui/use-toast'
import ShareButton from '@/components/ShareButton'

type FilterType = 'current' | 'past' | 'all'

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
  const [filter, setFilter] = useState<FilterType>('current')
  const [searchQuery, setSearchQuery] = useState('')
  const [avatarError, setAvatarError] = useState(false)
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [commentText, setCommentText] = useState('')
  const [openCommentMenu, setOpenCommentMenu] = useState<string | null>(null)
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()

  // Set base URL on client side only to avoid hydration mismatch
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])
  
  // Get ratings for all tournaments
  const tournamentIds = useMemo(() => {
    return tournaments?.map(t => t.id) || []
  }, [tournaments])
  
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
    onSuccess: () => {
      // Invalidate and refetch ratings after mutation
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

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  // Helper function to check if tournament is past
  // Rule: Tournament is past if endDate + 12 hours < next day (00:00)
  const isTournamentPast = (endDate: Date): boolean => {
    const endDateTime = new Date(endDate)
    // Add 12 hours to end date
    endDateTime.setHours(endDateTime.getHours() + 12)
    
    // Get next day at 00:00 (the "next date" mentioned in the rule)
    const now = new Date()
    const nextDay = new Date(now)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    
    // Tournament is past if endDate + 12 hours < next day
    return endDateTime < nextDay
  }

  // Filter tournaments based on selected filter and search query
  const filteredTournaments = useMemo(() => {
    if (!tournaments) return []
    
    let filtered = tournaments
    
    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(tournament =>
        tournament.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Apply time filter
    if (filter !== 'all') {
      filtered = filtered.filter(tournament => {
        const isPast = isTournamentPast(new Date(tournament.endDate))
        return filter === 'current' ? !isPast : isPast
      })
    }
    
    return filtered
  }, [tournaments, filter, searchQuery])
  
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

  const publicTournaments = filteredTournaments

  const hasValidAvatar = Boolean(session?.user?.image && 
    session.user.image.trim() !== '' &&
    (session.user.image.startsWith('http') || session.user.image.startsWith('data:')))
  
  const avatarSrc = session?.user?.image || ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
                <p className="text-gray-600 mt-2">Select a tournament to view results</p>
              </div>
              <div className="flex items-center gap-3">
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
                      onClick={handleLogout}
                      className="text-red-600 hover:text-red-900 px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    href="/auth/signin"
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Login
                  </Link>
                )}
              </div>
            </div>
            
            {/* Create Tournament Button */}
            <div className="mt-4">
              <button
                onClick={(e) => {
                  if (!session) {
                    e.preventDefault()
                    router.push('/auth/signin')
                  } else {
                    router.push('/admin/new')
                  }
                }}
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Create New Tournament
              </button>
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
            
            {/* Filter Tabs */}
            <div className="mt-4 flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setFilter('current')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  filter === 'current'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Current Tournaments
              </button>
              <button
                onClick={() => setFilter('past')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  filter === 'past'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Past Tournaments
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 font-medium text-sm transition-colors ${
                  filter === 'all'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All Tournaments
              </button>
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
                  <CardTitle className="text-xl pr-10">{tournament.title}</CardTitle>
                  <div className="mt-2 min-h-[4.5rem]">
                    {tournament.description ? (
                      <>
                        <div
                          className="text-gray-600 text-sm break-words line-clamp-3"
                          dangerouslySetInnerHTML={{ __html: formatDescription(truncateText(tournament.description)) }}
                        />
                        {tournament.description && tournament.description.split('\n').length > 3 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedDescription({title: tournament.title, description: tournament.description!})
                            }}
                            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Show full description
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-400 text-sm italic">No description</div>
                    )}
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

                  {/* Fixed bottom section: Like/Dislike and View Results */}
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
                  </div>
                </CardContent>
              </Card>
            ))}
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{tournament.title}</h2>
                  <p className="text-gray-600 mt-1">Tournament Details & Comments</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedTournament(null)
                    setCommentText('')
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                {/* Left Side - Tournament Info */}
                <div className="w-1/2 border-r border-gray-200 overflow-y-auto p-6">
                  <div className="space-y-4">
                    {/* Description */}
                    {tournament.description && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                        <div 
                          className="text-gray-700 whitespace-pre-wrap break-words prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: formatDescription(tournament.description) }}
                        />
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
                <div className="w-1/2 overflow-y-auto flex flex-col">
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
                                  {isOwnComment && (
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
                                            <button
                                              onClick={() => {
                                                if (confirm('Are you sure you want to delete this comment?')) {
                                                  deleteComment.mutate({ commentId: comment.id })
                                                }
                                              }}
                                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                              <span>Delete</span>
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
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
