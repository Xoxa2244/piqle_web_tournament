'use client'

import { useState, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Users, Trophy, Eye, User as UserIcon, ThumbsUp, ThumbsDown, Search } from 'lucide-react'

function AvatarImage({ src, alt, className }: { src?: string | null, alt?: string, className?: string }) {
  const [error, setError] = useState(false)
  const hasValidAvatar = Boolean(src && src.trim() !== '' && (src.startsWith('http') || src.startsWith('data:')))
  const avatarSrc = src || ''
  
  if (hasValidAvatar && !error && avatarSrc) {
    return (
      <Image
        src={avatarSrc}
        alt={alt || 'Profile'}
        width={32}
        height={32}
        className={className}
        onError={() => setError(true)}
      />
    )
  }
  
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300">
      <UserIcon className="h-5 w-5 text-gray-500" />
    </div>
  )
}

export default function PublicTournamentsPage() {
  const { data: session } = useSession()
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()
  
  // Get tournament IDs for rating query
  const tournamentIds = useMemo(() => {
    return tournaments?.map(t => t.id) || []
  }, [tournaments])

  // Get ratings for all tournaments
  const { data: ratings } = trpc.rating.getTournamentRatings.useQuery(
    { tournamentIds },
    { enabled: tournamentIds.length > 0 }
  )

  // Toggle rating mutation
  const utils = trpc.useUtils()
  const toggleRating = trpc.rating.toggleRating.useMutation({
    onSuccess: () => {
      // Refetch ratings after toggle
      utils.rating.getTournamentRatings.invalidate({ tournamentIds })
      utils.public.listBoards.invalidate()
    },
  })

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  // Filter tournaments by search query
  const filteredTournaments = useMemo(() => {
    if (!tournaments) return []
    if (!searchQuery.trim()) return tournaments
    
    const query = searchQuery.toLowerCase()
    return tournaments.filter(tournament => 
      tournament.title.toLowerCase().includes(query)
    )
  }, [tournaments, searchQuery])

  const handleRatingClick = (tournamentId: string, rating: 'LIKE' | 'DISLIKE') => {
    if (!session) {
      alert('Please log in to rate tournaments')
      return
    }
    toggleRating.mutate({ tournamentId, rating })
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

  const publicTournaments = filteredTournaments || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
              <p className="text-gray-600 mt-2">Select a tournament to view results</p>
            </div>
            {session && (
              <Link
                href="/profile"
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <AvatarImage 
                  src={session?.user?.image} 
                  alt={session?.user?.name || 'Profile'}
                  className="rounded-full object-cover"
                />
                <span className="hidden sm:inline">
                  {session?.user?.name || 'Profile'}
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              type="text"
              placeholder="Search tournaments by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full max-w-md"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {publicTournaments.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {publicTournaments.map((tournament) => {
              const tournamentRating = ratings?.[tournament.id] || {
                likes: 0,
                dislikes: 0,
                karma: 0,
                userRating: null,
              }

              return (
                <Card key={tournament.id} className="hover:shadow-lg transition-shadow flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-xl">{tournament.title}</CardTitle>
                    {tournament.description && (
                      <div className="mt-2">
                        <div
                          className="text-gray-600 text-sm break-words line-clamp-3"
                          dangerouslySetInnerHTML={{ __html: formatDescription(truncateText(tournament.description)) }}
                        />
                        {tournament.description && tournament.description.split('\n').length > 3 && (
                          <button
                            onClick={() => setSelectedDescription({title: tournament.title, description: tournament.description!})}
                            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Show full description
                          </button>
                        )}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4 flex-1 flex flex-col">
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
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Divisions:</h4>
                        <div className="flex flex-wrap gap-1">
                          {(tournament.divisions as any[]).map((division: any) => (
                            <Badge key={division.id} variant="secondary" className="text-xs">
                              {division.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Entry Fee */}
                    {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Trophy className="h-4 w-4 mr-2" />
                        <span>Entry Fee: ${tournament.entryFee}</span>
                      </div>
                    )}

                    {/* Tournament Director */}
                    {tournament.user && (
                      <div className="flex items-center text-sm text-gray-600">
                        <UserIcon className="h-4 w-4 mr-2" />
                        <span className="text-gray-500 mr-1">Tournament Director:</span>
                        <Link
                          href={`/profile/${tournament.user.id}`}
                          className="flex items-center space-x-1.5 text-gray-700 hover:text-gray-900 transition-colors group"
                        >
                          {(tournament.user as { image?: string | null }).image ? (
                            <Image
                              src={(tournament.user as { image?: string | null }).image!}
                              alt={tournament.user.name || tournament.user.email || 'TD'}
                              width={20}
                              height={20}
                              className="rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border border-gray-300">
                              <UserIcon className="h-3 w-3 text-gray-500" />
                            </div>
                          )}
                          <span className="font-medium group-hover:underline">
                            {tournament.user.name || tournament.user.email}
                          </span>
                        </Link>
                      </div>
                    )}

                    {/* Rating Section */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => handleRatingClick(tournament.id, 'LIKE')}
                        disabled={toggleRating.isPending || !session}
                        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                          tournamentRating.userRating === 'LIKE'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={!session ? 'Log in to like' : tournamentRating.userRating === 'LIKE' ? 'Remove like' : 'Like'}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span className="text-sm font-medium">{tournamentRating.likes}</span>
                      </button>
                      <button
                        onClick={() => handleRatingClick(tournament.id, 'DISLIKE')}
                        disabled={toggleRating.isPending || !session}
                        className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                          tournamentRating.userRating === 'DISLIKE'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={!session ? 'Log in to dislike' : tournamentRating.userRating === 'DISLIKE' ? 'Remove dislike' : 'Dislike'}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        <span className="text-sm font-medium">{tournamentRating.dislikes}</span>
                      </button>
                      <div className="ml-auto text-sm font-medium text-gray-600">
                        Karma: <span className={tournamentRating.karma >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {tournamentRating.karma > 0 ? '+' : ''}{tournamentRating.karma}
                        </span>
                      </div>
                    </div>

                    {/* View Results Button */}
                    <div className="pt-2">
                      <Link href={tournament.publicSlug ? `/t/${tournament.publicSlug}` : `/scoreboard/${tournament.id}`}>
                        <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                          View Results
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No tournaments found' : 'No Public Tournaments Available'}
            </h3>
            <p className="text-gray-600">
              {searchQuery 
                ? `No tournaments match "${searchQuery}"`
                : 'There are currently no tournaments with public results enabled.'}
            </p>
          </div>
        )}
      </div>

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
