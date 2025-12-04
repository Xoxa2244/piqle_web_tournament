'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { formatDescription } from '@/lib/formatDescription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, Trophy, Eye, DollarSign } from 'lucide-react'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'

type FilterType = 'current' | 'past' | 'all'

export default function HomePage() {
  const { data: session } = useSession()
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [filter, setFilter] = useState<FilterType>('current')
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  // Helper function to check if tournament is past
  const isTournamentPast = (endDate: Date): boolean => {
    const endDateTime = new Date(endDate)
    endDateTime.setHours(endDateTime.getHours() + 12)
    
    const now = new Date()
    const nextDay = new Date(now)
    nextDay.setDate(nextDay.getDate() + 1)
    nextDay.setHours(0, 0, 0, 0)
    
    return endDateTime < nextDay
  }

  // Filter tournaments based on selected filter
  const filteredTournaments = useMemo(() => {
    if (!tournaments) return []
    
    if (filter === 'all') {
      return tournaments
    }
    
    return tournaments.filter(tournament => {
      const isPast = isTournamentPast(new Date(tournament.endDate))
      return filter === 'current' ? !isPast : isPast
    })
  }, [tournaments, filter])

  if (isLoading) {
    return (
      <>
        <PublicHeader />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tournaments...</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PublicHeader />
      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-4">
                Pickleball Tournament Management
              </h1>
              <p className="text-xl text-blue-100">
                Find and join tournaments near you
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-2 py-4">
              <button
                onClick={() => setFilter('current')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'current'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Current Tournaments
              </button>
              <button
                onClick={() => setFilter('past')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'past'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Past Tournaments
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All Tournaments
              </button>
            </div>
          </div>
        </div>

        {/* Tournaments List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {filteredTournaments.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTournaments.map((tournament) => (
                <Card key={tournament.id} className="hover:shadow-lg transition-shadow">
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
                  <CardContent className="space-y-4">
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

                      {/* Entry Fee */}
                      {tournament.entryFee && parseFloat(tournament.entryFee) > 0 && (
                        <div className="flex items-center text-sm font-semibold text-green-600">
                          <DollarSign className="h-4 w-4 mr-2" />
                          <span>Entry Fee: ${tournament.entryFee}</span>
                        </div>
                      )}
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

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-gray-200 space-y-2">
                      {!session ? (
                        <Button 
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            // TODO: Implement registration flow
                            alert('Registration flow will be implemented soon!')
                          }}
                        >
                          Register & Join Tournament
                        </Button>
                      ) : (
                        <Link href={`/scoreboard/${tournament.id}`}>
                          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                            View Results & Register
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Tournaments Available</h3>
              <p className="text-gray-600">
                {filter === 'current' 
                  ? 'There are no current tournaments. Check back later!'
                  : filter === 'past'
                  ? 'No past tournaments found.'
                  : 'No tournaments available at this time.'}
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
    </>
  )
}
