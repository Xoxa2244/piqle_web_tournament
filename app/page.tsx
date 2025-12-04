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

type FilterType = 'upcoming' | 'in_progress' | 'past' | 'all'

export default function HomePage() {
  const { data: session } = useSession()
  const [selectedDescription, setSelectedDescription] = useState<{title: string, description: string} | null>(null)
  const [filter, setFilter] = useState<FilterType>('upcoming')
  const { data: tournaments, isLoading } = trpc.public.listBoards.useQuery()

  const truncateText = (text: string | null, maxLines: number = 3) => {
    if (!text) return ''
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text
    return lines.slice(0, maxLines).join('\n')
  }

  // Helper function to determine tournament status
  const getTournamentStatus = (startDate: Date, endDate: Date): 'upcoming' | 'in_progress' | 'past' => {
    const now = new Date()
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // Add 12 hours buffer to end date
    end.setHours(end.getHours() + 12)
    
    if (now < start) {
      return 'upcoming'
    } else if (now >= start && now <= end) {
      return 'in_progress'
    } else {
      return 'past'
    }
  }

  // Filter tournaments based on selected filter
  const filteredTournaments = useMemo(() => {
    if (!tournaments) return []
    
    if (filter === 'all') {
      return tournaments
    }
    
    return tournaments.filter(tournament => {
      const status = getTournamentStatus(new Date(tournament.startDate), new Date(tournament.endDate))
      return status === filter
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
                onClick={() => setFilter('upcoming')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'upcoming'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Upcoming (Register)
              </button>
              <button
                onClick={() => setFilter('in_progress')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'in_progress'
                    ? 'bg-green-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                In Progress
              </button>
              <button
                onClick={() => setFilter('past')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'past'
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Past
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 font-medium text-sm transition-colors rounded-lg ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All
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
                    <div className="flex items-start justify-between mb-2">
                      <CardTitle className="text-xl flex-1">{tournament.title}</CardTitle>
                      {(() => {
                        const status = getTournamentStatus(new Date(tournament.startDate), new Date(tournament.endDate))
                        return (
                          <Badge 
                            variant={status === 'upcoming' ? 'default' : status === 'in_progress' ? 'default' : 'secondary'}
                            className={
                              status === 'upcoming' ? 'bg-green-600' :
                              status === 'in_progress' ? 'bg-blue-600' :
                              'bg-gray-600'
                            }
                          >
                            {status === 'upcoming' ? 'Open' : status === 'in_progress' ? 'Live' : 'Ended'}
                          </Badge>
                        )
                      })()}
                    </div>
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
                      {(() => {
                        const status = getTournamentStatus(new Date(tournament.startDate), new Date(tournament.endDate))
                        
                        if (status === 'upcoming') {
                          // Upcoming tournaments - show registration button
                          if (!session) {
                            return (
                              <Button 
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => {
                                  window.location.href = `/auth/signin?callbackUrl=/register/${tournament.id}`
                                }}
                              >
                                Sign In to Register
                              </Button>
                            )
                          } else {
                            return (
                              <Link href={`/register/${tournament.id}`}>
                                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                                  Register & Join
                                </Button>
                              </Link>
                            )
                          }
                        } else {
                          // In progress or past - show results only
                          return (
                            <Link href={`/scoreboard/${tournament.id}`}>
                              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                                View Results
                              </Button>
                            </Link>
                          )
                        }
                      })()}
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
                {filter === 'upcoming' 
                  ? 'No upcoming tournaments available for registration. Check back soon!'
                  : filter === 'in_progress'
                  ? 'No tournaments currently in progress.'
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
